---
title: Services Overview
description: BigBrotr's eight independent services and how they work together.
---

BigBrotr runs eight independent services. Each service is a separate process with a single responsibility. Services communicate exclusively through the shared PostgreSQL database — there are no message queues, no inter-service APIs, and no orchestration layers.

## Service Summary

| Service | Role | Interval | External I/O |
|---------|------|----------|--------------|
| [Seeder](/docs/services/seeder/) | Bootstrap from seed file | One-shot (`--once`) | File I/O |
| [Finder](/docs/services/finder/) | Discover from APIs + events | 1 hour | HTTP APIs, event scan |
| [Validator](/docs/services/validator/) | WebSocket handshake test | 8 hours | WebSocket |
| [Monitor](/docs/services/monitor/) | NIP-11 + NIP-66 health checks | 1 hour | HTTP, WS, DNS, SSL, GeoIP |
| [Synchronizer](/docs/services/synchronizer/) | Archive events from relays | 15 min | WebSocket |
| [Refresher](/docs/services/refresher/) | Refresh materialized views | 1 hour | None (DB only) |
| [Api](/docs/services/api/) | Read-only REST API | Continuous | HTTP (FastAPI) |
| [Dvm](/docs/services/dvm/) | NIP-90 Data Vending Machine | 1 min | WebSocket (Nostr) |

## Independence

Each service:

- **Runs as its own process** with its own configuration file.
- **Has its own run cycle** — continuous services loop indefinitely with configurable sleep intervals; one-shot services (Seeder) exit after a single cycle.
- **Scales independently** — you can run multiple Finder instances or skip the Synchronizer entirely.
- **Fails independently** — if the Monitor crashes, the Validator keeps running.
- **Connects to the database through PgBouncer** using the `writer` database user.

## BaseService

All eight services inherit from `BaseService[ConfigT]`, a generic abstract base class that provides:

- **`run()`** — abstract method implementing one work cycle.
- **`cleanup()`** — abstract method for pre-cycle cleanup, called before `run()`, returns count of removed items.
- **`run_forever()`** — loop that calls cleanup → run → metrics → wait → repeat, with graceful shutdown.
- **`from_yaml()` / `from_dict()`** — factory methods that construct the service from YAML configuration.
- **Prometheus metrics** — automatic cycle duration, service info, and custom counters.
- **Structured logging** — via the `Logger` class with key=value format.
- **Graceful shutdown** — handles SIGINT/SIGTERM for clean process termination.

```python
class Finder(BaseService[FinderConfig]):
    """Discovers relay URLs from events and APIs."""

    async def run(self) -> None:
        # One work cycle: scan events, query APIs, insert candidates
        ...
```

## Network Support

Services that perform network I/O (Finder, Validator, Monitor, Synchronizer) support four network types through per-network configuration:

| Network | URL Pattern | Proxy |
|---------|------------|-------|
| Clearnet | `wss://relay.example.com` | Direct |
| Tor | `ws://abc.onion` | SOCKS5 |
| I2P | `ws://abc.b32.i2p` | SOCKS5 |
| Lokinet | `ws://abc.loki` | SOCKS5 |

Each network type has its own `ClearnetConfig`, `TorConfig`, `I2pConfig`, or `LokiConfig` with independent `timeout`, `proxy_url`, and `max_tasks` settings.

## Shared Infrastructure

The `services/common/` package provides building blocks used across all services:

- **`configs.py`** — per-network Pydantic configuration models (`ClearnetConfig`, `TorConfig`, `I2pConfig`, `LokiConfig`) with `NetworksConfig` container, plus `TableConfig` for per-table access policy.
- **`queries.py`** — batch insert utilities (`batched_insert`, `upsert_service_states`). Domain-specific SQL queries are distributed across service-specific `queries.py` modules.
- **`mixins.py`** — 5 cooperative mixins using `super().__init__(**kwargs)` via MRO:
  - `ConcurrentStreamMixin` — `_iter_concurrent()` with `asyncio.TaskGroup` + Queue streaming (Finder, Validator, Monitor, Synchronizer)
  - `NetworkSemaphoresMixin` — per-network `asyncio.Semaphore` from config (Validator, Monitor, Synchronizer)
  - `GeoReaderMixin` — GeoIP database lifecycle with async open/close (Monitor)
  - `ClientsMixin` — managed Nostr client pool with per-relay proxy URL resolution (Monitor)
  - `CatalogAccessMixin` — schema discovery + table access policy (Api, Dvm)
- **`catalog.py`** — `Catalog` runtime schema introspection and safe parameterized query builder, raises `CatalogError` to prevent leaking database internals.
- **`types.py`** — `Checkpoint` hierarchy (Api, Monitor, Publish, Candidate) and `Cursor` hierarchy (Sync, Finder).
