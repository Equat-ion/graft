# Sandbox Internals and Tampering Detection

The sandbox isolates each agent run, executes tests, and enforces the no test edits rule.

## Lifecycle

1. prepare()
   - Copy the repo into a temporary workspace.
   - Hash test files and test config files.
   - Count pytest skip markers (python only).
   - Run the baseline test suite.
2. run_tests()
   - Check tampering.
   - Run tests in docker (preferred) or locally if docker is unavailable.
3. submit() and final evaluation
   - Recheck tampering with stricter rules.
   - Restore original tests and test configs.
   - Run tests in a fresh container for the authoritative result.
4. cleanup()
   - Delete the workspace directory.

## Tampering detection

The sandbox compares the current workspace to the original snapshot:

- Hashes all files in tests/, test/, spec/, __tests__.
- Hashes test config files: pytest.ini, conftest.py, tox.ini, .coveragerc, setup.cfg, pyproject.toml, and JS test configs.
- Counts skip markers in python tests (skip, skipif, xfail).

If any test files or config files change, or skip markers increase, a violation is recorded. Violations force the reward to -1.0.

### pyproject.toml special case

During non final checks, pyproject.toml is only flagged if the [tool.pytest.*] section changes. During final evaluation, any change is flagged.

## Test execution

- Python: pytest -q --no-header --tb=short
- JavaScript or TypeScript: npm test -- --ci if defined, otherwise npx jest --ci
- Rust: cargo test --quiet

Bootstrap commands install dependencies based on the presence of common manifests such as pyproject.toml, requirements.txt, or package-lock.json.

## Docker vs local execution

The sandbox prefers docker if the docker SDK and socket are available. If docker is unavailable, tests run locally inside the backend environment. This is less isolated and should be avoided for production runs.

## Final evaluation

Final evaluation always restores the original tests and test configs before running. This ensures the reward uses the unmodified test suite, even if the agent attempted to tamper.
