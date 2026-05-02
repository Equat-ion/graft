"""Pure reward computation. No I/O, no side effects."""

from __future__ import annotations


def compute_reward(
    baseline_passed: int,
    baseline_failed: int,
    final_passed: int,
    final_failed: int,
    steps_taken: int,
    violation: str | None,
) -> float:
    if violation:
        return -1.0

    reward = 0.0

    # Terminal: all originally-passing tests still pass and nothing is broken.
    if final_passed >= baseline_passed and final_failed == 0:
        reward += 1.0

    # Partial: previously-failing tests now pass.
    newly_passing = max(0, final_passed - baseline_passed)
    reward += newly_passing * 0.05

    # Regression: previously-passing tests now fail.
    regressions = max(0, final_failed - baseline_failed)
    reward -= regressions * 0.10

    # Step cost.
    reward -= steps_taken * 0.01

    return round(reward, 4)
