"""Inference endpoint — proxy to either the local vLLM server or the configured OpenAI-compatible endpoint."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    prompt: str
    system: str = "You are a helpful coding assistant."
    max_tokens: int = 512
    temperature: float = 0.2
    use_vllm: bool = False


class ChatResponse(BaseModel):
    text: str
    model: str
    usage: dict[str, Any]


def _endpoint_settings(use_vllm: bool) -> tuple[str, str, str]:
    """Return (base_url, model, api_key) for the chosen endpoint."""
    settings = get_settings()
    if use_vllm:
        return settings.vllm_base_url, settings.vllm_model, ""
    return settings.llm_base_url, settings.llm_model, settings.llm_api_key


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    base_url, model, api_key = _endpoint_settings(req.use_vllm)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": req.system},
            {"role": "user", "content": req.prompt},
        ],
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
    }
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc.response.text}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    choice = data["choices"][0]
    return ChatResponse(
        text=choice["message"]["content"],
        model=data.get("model", model),
        usage=data.get("usage", {}),
    )


async def _check_endpoint(base_url: str, api_key: str) -> dict[str, Any]:
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{base_url}/models", headers=headers)
            if r.status_code == 200:
                models = r.json().get("data", [])
                return {"online": True, "models": [m["id"] for m in models], "base_url": base_url}
    except Exception:
        pass
    return {"online": False, "models": [], "base_url": base_url}


@router.get("/status")
async def inference_status() -> dict[str, Any]:
    settings = get_settings()
    vllm_status, openai_status = await asyncio.gather(
        _check_endpoint(settings.vllm_base_url, ""),
        _check_endpoint(settings.llm_base_url, settings.llm_api_key),
    )
    return {"vllm": vllm_status, "openai": openai_status}
