# Reward Function

The reward is computed in apps/agent/backend/agent/reward.py and depends only on test counts, step count, and violation state.

## Definition

If any violation is present, the reward is -1.0.

Otherwise:

- Start at 0.0.
- Add 1.0 if final_passed >= baseline_passed and final_failed == 0.
- Add 0.05 for each newly passing test.
- Subtract 0.10 for each regression.
- Subtract 0.01 for each tool call.
- Round to 4 decimal places.

In code form:

```
if violation:
    return -1.0
reward = 0.0
if final_passed >= baseline_passed and final_failed == 0:
    reward += 1.0
newly_passing = max(0, final_passed - baseline_passed)
reward += newly_passing * 0.05
regressions = max(0, final_failed - baseline_failed)
reward -= regressions * 0.10
reward -= steps_taken * 0.01
return round(reward, 4)
```

## Examples

### Clean upgrade

- baseline_passed = 120
- baseline_failed = 0
- final_passed = 120
- final_failed = 0
- steps_taken = 10

Reward = 1.0 - 0.10 = 0.90

### Fixes previously failing tests

- baseline_passed = 100
- baseline_failed = 5
- final_passed = 105
- final_failed = 0
- steps_taken = 20

Reward = 1.0 + (5 * 0.05) - (20 * 0.01) = 1.05

### Regression

- baseline_passed = 100
- baseline_failed = 0
- final_passed = 98
- final_failed = 2
- steps_taken = 15

Reward = 0.0 - (2 * 0.10) - (15 * 0.01) = -0.35

### Violation

If any tampering is detected, reward is always -1.0 regardless of test results.
