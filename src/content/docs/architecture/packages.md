---
title: Package Structure
description: Detailed breakdown of each package in the BigBrotr diamond DAG.
---

BigBrotr is organized into five packages, each with a single clear responsibility. This page details the contents and purpose of every package.

## models

**Pure domain foundations.** Frozen dataclasses representing Nostr concepts with invariants enforced at construction.

| Module | Contents |
|--------|----------|
| `relay.py` | `Relay` — URL validation (RFC 3986), network detection (clearnet/tor/i2p/loki/local), local IP rejection |
| `event.py` | `Event` — Nostr event with signature, `EventRelay` — junction model |
| `metadata.py` | `Metadata` — content-addressed with SHA-256 hash, `MetadataType` enum (7 types), `RelayMetadata` — junction model |
| `constants.py` | `NetworkType`, `ServiceName` (StrEnum), `EventKind` (IntEnum), `EVENT_KIND_MAX` |
| `service_state.py` | `ServiceState` — service checkpoint data, `ServiceStateType` (StrEnum), `ServiceStateDbParams` (NamedTuple) |

**Key patterns:**

- All models use `@dataclass(frozen=True, slots=True)` for immutability and memory efficiency.
- All models cache `to_db_params()` in `__post_init__` via a `_db_params` field (using `object.__setattr__` frozen workaround).
- `from_db_params()` classmethod reconstructs objects from database tuples with full re-validation.
- stdlib `logging` only — no `bigbrotr` imports.

## core

**Infrastructure and lifecycle.** Manages the connection pool, database operations, service lifecycle, logging, and metrics.

| Module | Contents |
|--------|----------|
| `pool.py` | `Pool` — asyncpg connection pool with retry/backoff and health-checked acquisition. `PoolConfig` Pydantic model. |
| `brotr.py` | `Brotr` — database facade. `_call_procedure()` for stored functions, generic query methods: `fetch()`, `fetchrow()`, `fetchval()`, `execute()`, `transaction()`. `BrotrConfig` with `BatchConfig` and `TimeoutsConfig`. |
| `base_service.py` | `BaseService[ConfigT]` — abstract base class. `run()` cycle, `run_forever()` loop, graceful shutdown. `from_yaml()`/`from_dict()` factory methods. |
| `logger.py` | `Logger` — structured key=value logging with JSON output mode. `format_kv_pairs()` utility. |
| `metrics.py` | Prometheus `/metrics` endpoint. Four metric types: `SERVICE_INFO`, `SERVICE_GAUGE`, `SERVICE_COUNTER`, `CYCLE_DURATION_SECONDS`. |
| `yaml.py` | YAML configuration file loading with environment variable interpolation. |

**Key patterns:**

- `Brotr._pool` is private. Services use `Brotr` methods, never the pool directly.
- `BaseService` is generic over `ConfigT` (a Pydantic `BaseModel`), enabling type-safe configuration.
- `Pool` implements `async with` context management for automatic cleanup.

## nips

**Protocol-aware I/O.** Each NIP implementation is a "sensor" that produces typed `Metadata` objects. The package contains shared base classes and two sub-packages.

| Module | Contents |
|--------|----------|
| `base.py` | Shared base classes for NIP implementations |
| `event_builders.py` | Nostr event construction for publishing monitoring data |
| `parsing.py` | Declarative field parsing utilities |
| `nip11/` | Sub-package: `nip11.py` (main class), `data.py` (data models), `logs.py` (result logging), `info.py` (field extraction) |
| `nip66/` | Sub-package: `nip66.py` (main class), `data.py`, `logs.py`, plus one module per test: `rtt.py`, `ssl.py`, `dns.py`, `geo.py`, `net.py`, `http.py` |

**NIP-66 health tests:**

| Test | MetadataType | Measures |
|------|-------------|----------|
| RTT | `NIP66_RTT` | WebSocket round-trip time in milliseconds |
| SSL | `NIP66_SSL` | Certificate validity, expiration, issuer |
| DNS | `NIP66_DNS` | Resolution time, IP addresses, DNSSEC |
| Geo | `NIP66_GEO` | Country, city, ASN, coordinates via GeoIP |
| Net | `NIP66_NET` | AS number, ISP name, network prefix |
| HTTP | `NIP66_HTTP` | HTTP status, headers, redirect chain |

NIP-11 produces `MetadataType.NIP11_INFO`.

**Key patterns:**

- Fetch methods never raise exceptions. Always check `logs.success` on the result.
- Depends on `utils` (for transport) and `models` (for data types). Does **not** depend on `core`.

## utils

**Network and crypto primitives.** Stateless helper functions with no business logic.

| Module | Contents |
|--------|----------|
| `protocol.py` | `create_client()`, `connect_relay()`, `broadcast_events()`, `is_nostr_relay()` — WebSocket client creation and relay connectivity testing. |
| `transport.py` | `DEFAULT_TIMEOUT`, `InsecureWebSocketTransport` — HTTP/WebSocket transport with SSL fallback and timeout configuration. |
| `http.py` | Bounded JSON reading and file downloads with size limits. |
| `dns.py` | DNS resolution utilities for relay URL validation. |
| `keys.py` | `load_keys_from_env()`, `KeysConfig` Pydantic model — Nostr key management for event signing and publishing. |
| `parsing.py` | Model parsing utilities for data extraction. |

**Key patterns:**

- All functions are stateless. No class instances, no side effects beyond I/O.
- SOCKS5 proxy support for Tor/I2P/Lokinet relays.
- Depends only on `models`.

## services

**Business logic.** Six independent services, each inheriting `BaseService[ConfigT]` and implementing `async def run()`.

| Service | Mode | Purpose |
|---------|------|---------|
| `seeder` | One-shot | Load relay URLs from seed files and known relay lists |
| `finder` | Continuous | Discover relay URLs from NIP-65 events and public APIs |
| `validator` | Continuous | Test WebSocket connectivity, promote candidates to relay table |
| `monitor` | Continuous | NIP-11 + NIP-66 health checks, publish kind 10166/30166 events |
| `refresher` | Scheduled | Orchestrate materialized view refresh cycles |
| `synchronizer` | Continuous | Cursor-based event collection from validated relays |

**Shared infrastructure** in `services/common/`:

| Module | Contents |
|--------|----------|
| `configs.py` | Per-network Pydantic models: `ClearnetConfig`, `TorConfig`, `I2pConfig`, `LokiConfig` with timeouts, proxy URLs, concurrency limits |
| `queries.py` | 15 domain-specific SQL query functions. Centralized to avoid scattering inline SQL. |
| `mixins.py` | `ChunkProgress` (cycle tracking), `NetworkSemaphoresMixin` (per-network concurrency), `GeoReaders` (GeoIP database lifecycle) |

## Next Steps

- [Data Flow](/architecture/data-flow/) — how data moves through the system.
- [Services Overview](/services/overview/) — detailed description of each service.
