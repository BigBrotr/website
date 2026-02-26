---
title: Contributing
description: Development setup, coding standards, and contribution workflow.
---

## Development Setup

```bash
# Clone and install
git clone https://github.com/BigBrotr/bigbrotr.git
cd bigbrotr
uv sync --group dev --group docs

# Verify everything works
make ci
```

## Branching Model

- `main` is release-ready. Never push directly.
- `develop` is the integration branch. Never push directly.
- All work happens on feature branches created from `develop`.

```bash
git checkout develop
git pull origin develop
git checkout -b feat/my-feature
```

### Branch Naming

Branch names follow the commit type prefix:

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring |
| `docs/` | Documentation changes |
| `test/` | Test additions or fixes |
| `chore/` | Build, CI, dependency updates |

## Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add relay timeout configuration
fix: handle empty NIP-11 response
refactor: simplify metadata hash computation
docs: update architecture overview
test: add validator edge case tests
chore: bump asyncpg to 0.29.0
```

The body explains **why**, not what. The footer references issues: `Closes #123`.

## Quality Checks

Before committing, run the full CI suite:

```bash
make ci
```

This runs:

| Check | Command | Purpose |
|-------|---------|---------|
| Lint | `ruff check src/ tests/` | Code quality (zero errors expected) |
| Format | `ruff format --check src/ tests/` | Code formatting |
| Types | `mypy src/bigbrotr` | Strict type checking |
| Tests | `pytest tests/ --ignore=tests/integration/` | Unit tests |

Coverage must stay above 80% (branch coverage).

## Code Style

- **Line length**: 100 characters
- **Target**: Python 3.11+
- **Formatter/Linter**: ruff (replaces black, isort, flake8)
- **Type checker**: mypy in strict mode

### Import Conventions

```python
# Same package: relative imports
from .logger import Logger
from .common.configs import ClearnetConfig

# Cross-package: absolute imports
from bigbrotr.core.logger import Logger
from bigbrotr.models.constants import NetworkType
```

Parent-relative imports are banned: `from ..core import Logger` is not allowed.

## Architecture Rules

The diamond DAG must be maintained. Never import upward:

- `models` imports only from stdlib
- `core` imports only from `models`
- `utils` imports only from `models`
- `nips` imports from `core`, `utils`, and `models`
- `services` imports from `core`, `nips`, `utils`, and `models`

## Pull Requests

PRs target `develop`. Include:

- Clear description of what changed and why
- Link to related issues
- Evidence that `make ci` passes

## Next Steps

- [Testing](/development/testing/) — how to write and run tests.
- [Architecture Overview](/architecture/overview/) — understand the codebase structure.
