---
title: Installation
description: Install BigBrotr from source for development and contribution.
---

This guide covers installing BigBrotr from source using `uv`, the fast Python package manager. For production deployments, see the [Quick Start](/getting-started/quick-start/) guide with Docker Compose.

## Prerequisites

- Python 3.11 or later
- PostgreSQL 16 or later (for integration tests)
- [uv](https://docs.astral.sh/uv/) package manager
- Git

## Install from Source

```bash
# Clone the repository
git clone https://github.com/BigBrotr/bigbrotr.git
cd bigbrotr

# Install all dependencies including dev and docs groups
uv sync --group dev --group docs
```

This creates a virtual environment in `.venv/` and installs all dependencies.

## Verify Installation

```bash
# Run the test suite (unit tests only)
pytest tests/ --ignore=tests/integration/ -v

# Run linting and type checking
ruff check src/ tests/
mypy src/bigbrotr

# Or run everything at once
make ci
```

## Available Make Targets

| Command | Description |
|---------|-------------|
| `make lint` | Run ruff linter |
| `make format` | Run ruff formatter |
| `make format-check` | Check formatting without changes |
| `make typecheck` | Run mypy strict type checking |
| `make test` | Run all tests |
| `make test-fast` | Run unit tests only (skip integration) |
| `make coverage` | Run tests with coverage report |
| `make audit` | Security audit of dependencies |
| `make ci` | Run lint + typecheck + test (full CI) |

## Development Workflow

BigBrotr uses a strict branching model:

1. `main` is release-ready. Never push directly.
2. `develop` is the integration branch.
3. All work happens on feature branches created from `develop`.

```bash
# Create a feature branch
git checkout develop
git pull origin develop
git checkout -b feat/my-feature

# Make changes, then verify
make ci

# Commit with conventional commit format
git commit -m "feat: add my feature"
```

Branch naming follows the commit type: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`.

## Running Services Locally

To run services outside Docker, you need a PostgreSQL instance with the BigBrotr schema:

```bash
# Initialize the database (from a deployment directory)
cd deployments/bigbrotr
# Apply the SQL initialization scripts in order

# Run a service with custom config
python -m bigbrotr seeder --once --config config/services/seeder.yaml --brotr-config config/brotr.yaml
```

Every service accepts these CLI flags:

| Flag | Description |
|------|-------------|
| `--config PATH` | Service-specific YAML config |
| `--brotr-config PATH` | Core database/pool config |
| `--log-level LEVEL` | DEBUG, INFO, WARNING, ERROR |
| `--once` | Run a single cycle then exit |

## Next Steps

- [Contributing](/development/contributing/) — coding standards, testing, and PR workflow.
- [Testing](/development/testing/) — how to write and run tests.
- [Architecture Overview](/architecture/overview/) — understand the codebase structure.
