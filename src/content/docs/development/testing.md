---
title: Testing
description: How to write, run, and organize tests in BigBrotr.
---

BigBrotr maintains approximately 2,400 unit tests and 90 integration tests (using testcontainers with PostgreSQL) with a minimum 80% branch coverage requirement.

## Running Tests

```bash
# All tests (unit + integration)
pytest tests/ -v

# Unit tests only (fast)
pytest tests/ --ignore=tests/integration/ -v

# Single file
pytest tests/unit/core/test_pool.py -v

# Pattern match
pytest -k "health_check" -v

# Coverage report
pytest tests/ --cov=src/bigbrotr --cov-report=html
```

## Test Configuration

From `pyproject.toml`:

- `asyncio_mode = "auto"` — no need for `@pytest.mark.asyncio` decorators
- `--timeout=120` — global test timeout
- `fail_under = 80` — branch coverage threshold

## Test Organization

```
tests/
├── conftest.py              # Root fixtures
├── fixtures/
│   └── relays.py            # Shared relay fixtures
├── unit/
│   ├── core/
│   │   ├── test_pool.py
│   │   ├── test_brotr.py
│   │   └── test_base_service.py
│   ├── models/
│   │   ├── test_relay.py
│   │   └── test_metadata.py
│   ├── nips/
│   │   ├── test_nip11.py
│   │   └── test_nip66.py
│   ├── utils/
│   │   └── test_protocol.py
│   └── services/
│       ├── test_seeder.py
│       ├── test_finder.py
│       ├── test_validator.py
│       ├── test_monitor.py
│       ├── test_refresher.py
│       └── test_synchronizer.py
└── integration/
    └── ...                  # Testcontainers PostgreSQL
```

## Conventions

### Class per Logical Unit

```python
class TestPoolConnect:
    """Tests for Pool.connect() method."""

class TestPoolRetry:
    """Tests for Pool retry behavior."""
```

### Method Naming

`test_<method>_<scenario>`:

```python
def test_run_empty_batch(self): ...
def test_connect_retry_exhausted(self): ...
def test_fetch_nip11_timeout(self): ...
```

### Required Coverage

Every test file should cover:
- Happy path
- Empty input
- Error/exception path
- Edge cases

## Mocking

### Mock at the Consumer's Namespace

Always mock where the function is used, not where it is defined:

```python
# Correct: mock where is_nostr_relay is imported
@patch("bigbrotr.services.validator.is_nostr_relay")

# Wrong: mock at the source module
@patch("bigbrotr.utils.protocol.is_nostr_relay")
```

### Root Fixtures

The root `conftest.py` provides shared fixtures:

| Fixture | Provides |
|---------|----------|
| `mock_pool` | Mocked asyncpg connection pool |
| `mock_brotr` | Mocked Brotr database facade |
| `mock_connection` | Mocked database connection |
| `sample_event` | Pre-built Event instance |
| `sample_relay` | Pre-built Relay instance |
| `sample_metadata` | Pre-built Metadata instance |

### Service Mocking Pattern

Service tests mock query functions at the service module namespace:

```python
@patch("bigbrotr.services.finder.service.fetch_candidates")
async def test_run_discovers_relays(self, mock_fetch):
    mock_fetch.return_value = [...]
    await service.run()
    mock_fetch.assert_called_once()
```

## Integration Tests

Integration tests use testcontainers to spin up a real PostgreSQL instance:

```python
@pytest.fixture(scope="session")
async def pg_container():
    # Starts a PostgreSQL container, applies schema, yields connection
    ...
```

These tests verify stored functions, cascade functions, and materialized views against a real database.

## Next Steps

- [Contributing](/development/contributing/) — development workflow and coding standards.
