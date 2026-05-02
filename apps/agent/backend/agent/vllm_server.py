"""Manage the vLLM OpenAI-compatible server as a child process."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

from backend.agent.model_loader import resolve_model_path

logger = logging.getLogger(__name__)

_proc: subprocess.Popen | None = None


def _is_local_path(model_path: str) -> bool:
    """Heuristic: HuggingFace IDs look like 'org/model'; local paths exist on disk."""
    return Path(model_path).exists()


def start_vllm_server() -> str:
    """Start vLLM serving the best available checkpoint. Block until healthy.

    Returns the OpenAI-compatible base URL.
    """
    global _proc
    model_path, source = resolve_model_path()
    port = int(os.getenv("VLLM_PORT", "8001"))
    base_url = f"http://localhost:{port}/v1"
    gpu_util = os.getenv("VLLM_GPU_UTIL", "0.85")

    logger.info(
        "Starting vLLM | source=%s | model=%s | port=%s", source, model_path, port
    )

    common = [
        sys.executable, "-m", "vllm.entrypoints.openai.api_server",
        "--port", str(port),
        "--host", "0.0.0.0",
        "--dtype", "bfloat16",
        "--max-model-len", "4096",
        "--gpu-memory-utilization", gpu_util,
    ]

    if source in ("sft", "grpo") and _is_local_path(model_path):
        base_model = os.getenv("TRAINING_BASE_MODEL", "Qwen/Qwen2.5-Coder-3B-Instruct")
        cmd = common + [
            "--model", base_model,
            "--enable-lora",
            "--lora-modules", f"graft-agent={model_path}",
        ]
    else:
        cmd = common + [
            "--model", model_path,
            "--served-model-name", "graft-agent",
        ]

    _proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

    deadline = time.time() + 120
    while time.time() < deadline:
        if _proc.poll() is not None:
            raise RuntimeError(
                f"vLLM exited early with code {_proc.returncode}; check container logs"
            )
        try:
            r = httpx.get(f"http://localhost:{port}/health", timeout=2)
            if r.status_code == 200:
                logger.info("vLLM ready at %s [%s checkpoint]", base_url, source)
                return base_url
        except (httpx.HTTPError, OSError):
            pass
        time.sleep(2)

    stop_vllm_server()
    raise RuntimeError("vLLM server failed to become healthy within 120s")


def stop_vllm_server() -> None:
    global _proc
    if _proc is None:
        return
    try:
        _proc.terminate()
        try:
            _proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            _proc.kill()
            _proc.wait(timeout=5)
    finally:
        _proc = None
