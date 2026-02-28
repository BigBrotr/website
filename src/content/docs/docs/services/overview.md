---
title: Services Overview
description: BigBrotr's eight independent services and how they work together.
---

BigBrotr runs eight independent services. Each service is a separate process with a single responsibility. Services communicate exclusively through the shared PostgreSQL database — there are no message queues, no inter-service APIs, and no orchestration layers.

## Service Summary

| Service | Mode | Responsibility |
|---------|------|---------------|
| [Seeder](/docs/services/seeder/) | One-shot | Load relay URLs from seed files and known relay lists |
| [Finder](/docs/services/finder/) | Continuous | Discover new relay URLs from NIP-65 events and public APIs |
| [Validator](/docs/services/validator/) | Continuous | Test WebSocket connectivity and promote candidates to relay table |
| [Monitor](/docs/services/monitor/) | Continuous | NIP-11 + NIP-66 health checks, optionally publish monitoring events |
| [Refresher](/docs/services/refresher/) | Scheduled | Orchestrate materialized view refresh cycles |
| [Synchronizer](/docs/services/synchronizer/) | Continuous | Cursor-based event collection from validated relays |
| Api | Continuous | REST API with automatic schema discovery, filtering, sorting, pagination |
| Dvm | Continuous | NIP-90 Data Vending Machine for native Nostr protocol access |

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
- **`run_forever()`** — loop that calls `run()` repeatedly with sleep intervals and graceful shutdown.
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

- **`configs.py`** — per-network Pydantic configuration models with sensible defaults.
- **`queries.py`** — 15 domain-specific SQL query functions, centralized to avoid scattering inline SQL.
- **`mixins.py`** — `ChunkProgress` for cycle tracking, `NetworkSemaphoresMixin` for per-network concurrency control, `GeoReaders` for GeoIP database lifecycle.
