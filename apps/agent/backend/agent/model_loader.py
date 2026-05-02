"""Resolve which model checkpoint vLLM should serve.

Priority: GRPO (latest batch_*) → SFT → base model.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def _grpo_batches(grpo_dir: Path) -> list[Path]:
    """Return GRPO batch checkpoint dirs sorted newest-first."""
    if not grpo_dir.exists():
        return []
    batches: list[tuple[int, Path]] = []
    for d in grpo_dir.iterdir():
        if not d.is_dir() or not d.name.startswith("batch_"):
            continue
        try:
            n = int(d.name.split("_", 1)[1])
        except (IndexError, ValueError):
            continue
        batches.append((n, d))
    batches.sort(key=lambda t: t[0], reverse=True)
    return [d for _, d in batches]


def _looks_like_checkpoint(p: Path) -> bool:
    return (p / "adapter_config.json").exists() or (p / "config.json").exists()


def resolve_model_path() -> tuple[str, str]:
    """Return (model_path, source_label) where source_label ∈ {grpo, sft, base}."""
    forced = os.getenv("FORCE_MODEL_SOURCE", "").strip().lower()

    grpo_dir = Path(os.getenv("GRPO_CHECKPOINT_DIR", "training/checkpoints/grpo"))
    sft_dir = Path(os.getenv("SFT_CHECKPOINT_DIR", "training/checkpoints/sft"))
    base = os.getenv("TRAINING_BASE_MODEL", "Qwen/Qwen2.5-Coder-3B-Instruct")

    if forced not in ("", "base", "sft", "grpo"):
        logger.warning("Ignoring unknown FORCE_MODEL_SOURCE=%r", forced)
        forced = ""

    # GRPO
    if forced in ("", "grpo"):
        for candidate in _grpo_batches(grpo_dir):
            if _looks_like_checkpoint(candidate):
                logger.info("Using GRPO checkpoint: %s", candidate)
                return str(candidate), "grpo"
        if forced == "grpo":
            raise RuntimeError(f"FORCE_MODEL_SOURCE=grpo but no checkpoint in {grpo_dir}")

    # SFT
    if forced in ("", "sft"):
        if sft_dir.exists() and _looks_like_checkpoint(sft_dir):
            logger.info("Using SFT checkpoint: %s", sft_dir)
            return str(sft_dir), "sft"
        if forced == "sft":
            raise RuntimeError(f"FORCE_MODEL_SOURCE=sft but no checkpoint in {sft_dir}")

    # Base
    logger.info("Using base model from Hub: %s", base)
    return base, "base"
