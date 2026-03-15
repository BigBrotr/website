---
title: "Inside BigBrotr: Building a Distributed Relay Observatory for the Nostr Network"
date: 2026-02-28
authors:
  - bigbrotr
tags:
  - architecture
  - deep-dive
  - nostr
description: A technical deep dive into BigBrotr's architecture — eight services, ~18,000 lines of Python, 25 stored procedures, 11 materialized views, and the design decisions behind a Nostr relay observatory.
excerpt: A technical deep dive into BigBrotr's architecture — eight services, ~18,000 lines of Python, 25 stored procedures, 11 materialized views, and the design decisions behind a Nostr relay observatory.
---

If you've spent any time on Nostr, you've probably wondered: how many relays are actually out there? Which ones are healthy? What kind of events are flowing through them? There's no central registry, no dashboard, no authority you can ask. Relays come and go, some are solid, some are broken, some lie about their capabilities.

BigBrotr exists to answer those questions. It's a distributed system that discovers relays across clearnet, Tor, I2P, and Lokinet, monitors their health, archives the events they publish, and makes all of that data accessible through both a REST API and a native Nostr DVM interface.

This post walks through the architecture — not as a sales pitch, but as a technical deep dive into how the system is put together, what problems we ran into, and why certain decisions were made. If you like distributed systems, async Python, or PostgreSQL internals, there's probably something here for you.

The project started in August 2025, funded by an [OpenSats](https://opensats.org/) grant. It's about ~18,000 lines of Python across 88 modules, ~2,955 tests (~2,739 unit + ~216 integration), 8 independent services, and 13 Docker containers. One person, start to finish.

---

## The Problem

Nostr is decentralized. Thousands of relays are scattered across the globe on four different networks: clearnet (public internet), Tor (.onion), I2P (.i2p), and Lokinet (.loki). Nobody knows for certain how many relays exist, how healthy they are, or what events are being published through them.

BigBrotr tackles this through five pillars:

1. **Relay Discovery** — Finding relays automatically from external APIs, seed files, and mining URLs from event tags.
2. **Relay Health Monitoring** — Running 7 health checks per relay: NIP-11 info fetch, RTT latency (WebSocket open/read/write), SSL certificate inspection, DNS records, IP geolocation, network/ASN info, and HTTP headers.
3. **Event Archiving** — Connecting to relays via WebSocket and archiving events with cursor-based pagination, tracking progress per relay.
4. **Analytics** — 11 PostgreSQL materialized views pre-computing aggregate statistics (event distribution by kind, per-relay stats, author counts, NIP adoption, software distribution, daily time series). These views are the foundation for present and future analysis of the Nostr network.
5. **Data Access** — Two parallel interfaces exposing the same data: a REST API (FastAPI) for traditional HTTP clients, and a DVM (NIP-90 Data Vending Machine) for native Nostr clients over WebSocket.

All of this with full observability: Prometheus metrics for every service, pre-provisioned Grafana dashboards, AlertManager for alerting, postgres-exporter for DB metrics, and structured key=value logging with JSON output.

The system has to deal with:
- Thousands of relays on 4 different networks with different proxies (SOCKS5 for Tor)
- Relays with unpredictable behavior (malformed JSON, timeouts, expired certificates, unreliable self-reports)
- Efficient deduplication of identical metadata across different relays (content-addressed SHA-256)
- Bulk PostgreSQL operations (tens of thousands of inserts per cycle)
- Publishing results back to the Nostr protocol itself (the monitor publishes NIP-66 relay discovery events readable by other Nostr clients)

---

## High-Level Architecture — 8 Services, Zero Coupling

### The Core Principle

All services share PostgreSQL as their **sole communication channel**. No service calls another directly — no RPC, no message queue, no shared memory. The database acts as an implicit event log.

```
                  ┌───────────────────────────────────────────────┐
                  │                PostgreSQL 16                  │
                  │      6 tables · 11 views · 25 procedures      │
                  └──┬───────────┬──────────┬───────────┬─────────┘
                     │           │          │           │
        ┌────────────┘           │          │           └──────────┐
        │                        │          │                      │
┌───────┴────────┐  ┌────────────┴───┐  ┌───┴───────────┐  ┌───────┴──────────┐
│ relay          │  │ relay          │  │ event         │  │ analysis &       │
│ discovery      │  │ monitoring     │  │ archive       │  │ access           │
│                │  │                │  │               │  │                  │
│ Seeder  (boot) │  │ Monitor        │  │ Synchronizer  │  │ Refresher (views)│
│ Finder  (disc) │  │  7 health      │  │  cursor-based │  │ Api       (http) │
│ Validator (ws) │  │  checks/relay  │  │  pagination   │  │ Dvm      (nostr) │
└────────────────┘  └────────────────┘  └───────────────┘  └──────────────────┘
```

Five pillars, eight services.

### The Data Pipeline

1. **Seeder** (one-shot) — Bootstrap: loads relay URLs from a seed file as "candidates."
2. **Finder** (recurring) — Discovers new relays from external APIs + mines URLs from tags in already-archived events. Inserts candidates.
3. **Validator** (recurring) — Picks up candidates, tests them with a WebSocket handshake. If a relay speaks proper Nostr protocol, it gets promoted to the `relay` table. If it fails, the error counter increments. After N consecutive failures, the candidate gets dropped.
4. **Monitor** (recurring) — For every validated relay, runs 7 health checks in parallel (NIP-11 info + 6 NIP-66 tests). Produces content-addressed metadata with SHA-256. Publishes relay discovery events (Kind 30166) back onto the Nostr network itself.
5. **Synchronizer** (recurring) — Connects to relays via WebSocket and archives events with cursor-based pagination. Tracks progress per relay.
6. **Refresher** (recurring) — Refreshes 11 materialized views in dependency order. Pre-computes aggregate statistics that power the API responses.
7. **Api** (continuous) — REST API with automatic schema discovery. Exposes all tables and materialized views with filtering, sorting, pagination. A parameterized query builder that prevents SQL injection by construction.
8. **Dvm** (continuous) — NIP-90 Data Vending Machine: responds to Nostr requests over WebSocket, exposing the same data as the API on the native Nostr protocol. Any Nostr client can query BigBrotr without HTTP.

### Why the Database as Communication Channel

**The good stuff:**
- Total decoupling: each service scales independently
- Fault isolation: if Monitor goes down, Finder/Validator/Synchronizer keep running
- Observability: all interactions are visible in the DB
- Idempotency: upsert, insert-or-skip, atomic cascades
- No additional infrastructure to maintain (no Redis, no RabbitMQ, no Kafka)

**The conscious trade-off:** higher inter-service latency compared to direct RPC. But that's fine — this isn't a real-time system. Services run on 1-5 minute cycles. The simplicity is worth it.

---

## Package Architecture — The Diamond DAG

Imports flow strictly downward, enforced by ruff's linter rules:

```
              services         ← Business logic (8 services)
             /   |   \
          core  nips  utils    ← Infrastructure, protocol, network primitives
             \   |   /
              models           ← Pure domain (zero I/O, frozen dataclasses)
```

This is a diamond DAG — `services` at the top, `models` at the bottom, three middle layers that can import from `models` and be imported by `services`, but never from each other. The DAG guarantees no circular imports and lets you use any subset of the package without pulling in unnecessary dependencies.

### `models/` — Pure Domain, Immutable, Fail-Fast

The core principle here: **no invalid object can exist**. All validation happens in the constructor (`__post_init__`). If data is invalid, the constructor raises.

Every model follows the same pattern:

```python
@dataclass(frozen=True, slots=True)
class Metadata:
    type: MetadataType
    data: Mapping[str, Any]

    # Computed fields, excluded from repr/compare/hash
    _canonical_json: str = field(default="", init=False, repr=False, compare=False)
    _content_hash: bytes = field(default=b"", init=False, repr=False, compare=False)
    _db_params: MetadataDbParams = field(default=None, init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        # 1. Validate
        validate_instance(self.type, MetadataType, "type")
        validate_mapping(self.data, "data")

        # 2. Sanitize (remove None, empty containers, null bytes)
        sanitized = sanitize_data(self.data, "data")

        # 3. Canonical JSON (sort_keys, compact separators, UTF-8)
        canonical = json.dumps(sanitized, sort_keys=True, separators=(",", ":"))

        # 4. SHA-256 hash of canonical JSON
        content_hash = hashlib.sha256(canonical.encode("utf-8")).digest()

        # 5. Deep freeze (recursive MappingProxyType) for total immutability
        object.__setattr__(self, "data", deep_freeze(sanitized))
        object.__setattr__(self, "_canonical_json", canonical)
        object.__setattr__(self, "_content_hash", content_hash)
        object.__setattr__(self, "_db_params", self._compute_db_params())
```

A few things worth noting:

- **`frozen=True`** means the hash never changes after construction. You can safely use these as dict keys or set members.
- **`object.__setattr__`** is a documented workaround for setting computed fields in frozen dataclasses. It looks odd, but it's the right way to do it.
- **`deep_freeze()`** wraps dicts with `MappingProxyType` and lists with `tuple`. Trying `metadata.data["key"] = "value"` raises `TypeError`. The data is genuinely immutable, not just "please don't mutate this."
- **`_db_params` is cached**: conversion to a NamedTuple (what asyncpg wants) happens once at construction time, not on every DB call.

**Content-addressed deduplication** is the key insight. Two relays reporting the same NIP-11 data produce the same SHA-256 hash → one row in the `metadata` table. The composite PK `(id, type)` allows the same hash for different types (which is valid — different data structures can hash to the same value, and we need to distinguish them).

**Relay URL validation** (`relay.py`) does full RFC 3986 parsing with the `rfc3986` library, auto-detects network type (clearnet/tor/i2p/loki) from TLD and IP, rejects local addresses (26 IANA IPv4/IPv6 ranges), normalizes the scheme (`wss://` for clearnet, `ws://` for overlay networks that handle encryption themselves), and strips default ports.

**"Never trust stored data"** is a design invariant. Every constructor re-validates everything, even data that "should" already be validated. A `Relay` read from the DB gets re-parsed completely. A `Metadata` read from the DB gets its hash recomputed. If the data is corrupt, the constructor fails immediately. This catches a class of bugs that "trust the DB" approaches miss.

### `core/` — Infrastructure and Lifecycle

#### Connection Pool (`pool.py`, 738 lines)

The asyncpg pool with configurable retry/backoff is one of the more carefully designed pieces:

- **5 nested Pydantic models** for configuration: DatabaseConfig, LimitsConfig, TimeoutsConfig, RetryConfig, ServerSettingsConfig → aggregated in PoolConfig.
- **Password from environment variable** (never in YAML): the `password_env` pattern with a `@model_validator(mode="before")` that resolves from `os.getenv()`. Pydantic's `SecretStr` never appears in logs or repr.
- **Exponential vs linear backoff**: configurable via boolean. `2^attempt` vs `(attempt + 1)`, both bounded by `max_delay`.
- **Async lock for thread-safe connection**: prevents race conditions if multiple coroutines call `connect()` simultaneously. Idempotent — the second call returns immediately.
- **Error discrimination in retry**: retry ONLY on transient errors (`InterfaceError`, `ConnectionDoesNotExistError`). Query errors (syntax, constraint violations) propagate immediately — this prevents infinite loops on bad SQL, which is a surprisingly common mistake in retry logic.
- **Fresh connection per retry attempt**: each attempt acquires a new connection from the pool. If the previous one was broken mid-query, the new socket works.
- **Dual JSON codec**: handles both pre-serialized JSON strings (from `Metadata.canonical_json`) and raw Python dicts. Without this, double serialization would corrupt the data silently.

#### DB Facade (`brotr.py`, 964 lines)

High-level facade wrapping all PostgreSQL stored procedures:

- **3-level cascading timeouts**: asyncpg client-side (configurable per type: query=60s, batch=120s, cleanup=90s, refresh=unlimited) → PgBouncer query_timeout (300s safety net) → PostgreSQL statement_timeout. The tightest level wins. A runaway query doesn't block other connections.
- **`_call_procedure()`**: central private method that executes all stored procedures with the appropriate timeout, automatic retry, and parameter conversion.
- **Generic methods**: `fetch()`, `fetchrow()`, `fetchval()`, `execute()`, `transaction()` — services use ONLY these, never the pool directly.

#### Service Lifecycle (`base_service.py`, 418 lines)

This combines Template Method + State Machine + Async Context Manager:

- **Bounded generics**: `BaseService[ConfigT]` with `ConfigT = TypeVar("ConfigT", bound=BaseServiceConfig)` → mypy does type-narrowing of the config in derived services. Your service config is correctly typed everywhere.
- **`run_forever()` loop**: the ONLY broad `except Exception` in the entire codebase. Documented and justified as the event loop boundary. `CancelledError`, `KeyboardInterrupt`, `SystemExit` always propagate.
- **Interruptible wait**: `wait(timeout)` wraps `asyncio.wait_for(event.wait())`. The service wakes up immediately on shutdown signal, even with a 5-minute interval between cycles. Never `asyncio.sleep()` — it's not interruptible.
- **Consecutive failure tracking**: error counter that resets to 0 on success. If it exceeds `max_consecutive_failures`, the service exits. If set to 0, no limit.
- **Automatic Prometheus metrics**: cycle duration, timestamp, successes, errors, error type — all wired in `run_forever()`, not in derived services.
- **Factory methods**: `from_yaml()` and `from_dict()` use `cls.CONFIG_CLASS` for dynamic config parsing without boilerplate in services.

#### Structured Logging (`logger.py`, 249 lines)

Key=value logging with optional JSON output. `format_kv_pairs()` for consistent formatting. Integrated with Prometheus: every cycle log includes metrics.

#### Prometheus Metrics (`metrics.py`, 209 lines)

Four metric types: `SERVICE_INFO` (identity), `SERVICE_GAUGE` (per-cycle snapshot), `SERVICE_COUNTER` (cumulative), `CYCLE_DURATION_SECONDS` (histogram). HTTP server on port 8000 for scraping.

### `nips/` — Protocol Layer with Graceful Degradation

**The golden rule:** NIP fetch methods never raise exceptions. Errors are captured in `logs.success` / `logs.reason`, allowing batch processing of hundreds of relays without individual error handling.

#### Declarative Parsing (`FieldSpec`)

```python
@dataclass(frozen=True, slots=True)
class FieldSpec:
    int_fields: frozenset[str]       # Excludes bool (Python: bool is a subclass of int!)
    bool_fields: frozenset[str]
    str_fields: frozenset[str]
    str_list_fields: frozenset[str]  # list[str], invalid elements filtered out
    float_fields: frozenset[str]     # int or float → float
    int_list_fields: frozenset[str]  # list[int], bool excluded
```

Each data model declares a `_FIELD_SPEC` and the `parse_fields()` function applies type coercion with silent failure. Invalid or missing fields get skipped — because relay JSON is "garbage-in." NIP implementations must never crash on corrupt data. The schema can be declared once and the parser handles the messy reality of the open internet.

#### NIP-11: Relay Info Fetch

- HTTP(S) fetch with aiohttp, SOCKS5 proxy support for overlay networks
- SSL strategy: verify first → fallback to `CERT_NONE` if `allow_insecure` is configured → error otherwise
- Response limited to 64 KB, Content-Type validated (`application/nostr+json` or `application/json`)
- Data parsed into `Nip11InfoData` (30+ fields: name, description, pubkey, supported NIPs, limitations, fees, retention policies)
- Python reserved keyword handling: NIP-11 field `"self"` aliased to `self_pubkey` with `populate_by_name=True`

#### NIP-66: 6 Concurrent Health Tests

Six independent tests per relay, each producing a `MetadataType`:

| Test | Type | I/O | Notes |
|------|------|-----|-------|
| **RTT** | `NIP66_RTT` | WebSocket open/read/write | 3 sequential phases with cascading failure |
| **SSL** | `NIP66_SSL` | TCP socket (2 connections) | Clearnet only. Extracts with CERT_NONE, validates separately |
| **DNS** | `NIP66_DNS` | dnspython (thread pool) | A, AAAA, CNAME, NS, PTR records |
| **Geo** | `NIP66_GEO` | GeoIP2 City (thread pool) | Latitude, longitude, geohash (precision 9) |
| **Net** | `NIP66_NET` | GeoIP2 ASN | ASN, organization, CIDR. IPv4 takes priority over IPv6 |
| **HTTP** | `NIP66_HTTP` | aiohttp TraceConfig | Captures headers from WebSocket upgrade handshake |

The execution uses `asyncio.gather(*tasks, return_exceptions=True)`:

```python
results = await asyncio.gather(*tasks, return_exceptions=True)

for name, result in zip(task_names, results, strict=True):
    if isinstance(result, (asyncio.CancelledError, KeyboardInterrupt, SystemExit)):
        raise result  # Shutdown signals ALWAYS propagate
    if isinstance(result, BaseException):
        logger.error("test=%s error=%r", name, result)
        metadata_map[name] = None  # Failed test → None
    else:
        metadata_map[name] = result
```

One crashing test doesn't kill the others. The operator sees in the log which test failed. The field is `None` in the result.

**RTT — Cascading Failure Pattern**: if the WebSocket open fails, read and write are automatically marked as failed with the same reason. No point testing read/write if the connection didn't open.

**RTT — Coroutine Factory for Retry**: the retry pattern uses a `coro_factory: Callable[[], Coroutine]` because Python coroutines are single-use. Once awaited, they can't be re-awaited. The retry creates a fresh coroutine on each attempt:

```python
async def _with_retry(self, coro_factory, retry_config):
    for attempt in range(retry_config.max_attempts):
        result = await coro_factory()
        if result is not None:
            return result
        delay = min(retry_config.initial_delay * (2 ** attempt), retry_config.max_delay)
        jitter = random.uniform(0, retry_config.jitter)
        await asyncio.sleep(delay + jitter)
    return None
```

Exponential backoff + jitter decorrelates concurrent retries, preventing thundering herd when multiple relays fail simultaneously.

**SSL — Two-Connection Methodology**: Connection 1 with `CERT_NONE` to extract the certificate even from invalid/self-signed chains. Connection 2 with default context to validate the chain. This lets us monitor relays with expired certificates — monitoring should see the state, not just valid certs.

**Dependency Injection for Optional Features**: if GeoIP databases aren't available, Geo/Net tests are silently skipped. If signing keys aren't configured, the RTT test is skipped. Same code handles deployments with and without optional features.

#### Event Builders: Ground Truth > Self-Report

When building discovery event tags (Kind 30166), NIP-66 probe results (ground truth) override NIP-11 self-reports:

```python
if write_success is True:
    # Probe wrote successfully without auth/payment → relay is open
    auth = False
    payment = False
elif write_success is False and write_reason:
    # Probe failed → trust the reason, supplement with NIP-11
    auth = bool("auth" in write_reason or nip11_auth)
    payment = bool("pay" in write_reason or nip11_payment)
else:
    # No probe result → NIP-11 is all we have
    auth = bool(nip11_auth)
    payment = bool(nip11_payment)
```

Relays can lie about auth/payment requirements. The NIP-66 probe result is authoritative.

### `utils/` — Network Primitives

- **DNS**: A/AAAA resolution with dnspython, executed in thread pool via `asyncio.to_thread()` to avoid blocking the event loop
- **Transport**: WebSocket/HTTP with SSL fallback, `InsecureWebSocketTransport` for overlay networks, configurable `DEFAULT_TIMEOUT`
- **Keys**: `load_keys_from_env()` loads Nostr keys from environment variables, `KeysConfig` Pydantic model with validation
- **Protocol**: `create_client()`, `connect_relay()`, `broadcast_events()`, `is_nostr_relay()` — all Nostr operations wrapped with error handling

### `services/` — Business Logic

Let me go through each service briefly, highlighting what makes each one interesting.

#### Seeder (111 lines) — Bootstrap

One-shot parsing of a seed file (one URL per line). Validates each URL → `Relay` object. Inserts as candidates or directly as relays. No retry, no cycle. `restart: no` in Docker Compose. It runs once and exits.

#### Finder (398 lines) — Multi-Source Discovery

Two discovery sources:

1. **Event Mining**: for each relay in the DB, scans events archived by Synchronizer looking for relay URLs in tags. Uses composite cursors `(seen_at, event_id)` for deterministic pagination. Cursors are persisted in the DB — if Finder restarts, it resumes where it left off.

2. **External APIs**: HTTP GET on configurable endpoints (e.g., Nostr aggregator APIs). Parsing with JMESPath to extract URLs from arbitrary JSON structures.

Concurrency via `asyncio.TaskGroup` + semaphore to limit parallel event scans per relay.

#### Validator (237 lines) — WebSocket Handshake Test

Cycle: cleanup stale → cleanup exhausted → validate.

- **Priority queue**: candidates ordered by `(failures ASC, updated_at ASC)` — those with fewer failures get priority
- **Per-network semaphores**: Tor gets fewer simultaneous connections than clearnet
- **Atomic promotion**: `promote_candidates()` = `insert_relay()` + `DELETE service_state CANDIDATE` in a single operation
- **Per-cycle budget**: configurable `max_candidates`; the validator processes at most N candidates per cycle
- **`allow_insecure`**: configurable SSL fallback for relays with invalid certificates

#### Monitor (669 lines) — The Most Complex Service

Quadruple mixin composition:

```python
class Monitor(
    ConcurrentStreamMixin,    # TaskGroup + Queue streaming
    NetworkSemaphoresMixin,   # Per-network semaphores
    GeoReaderMixin,           # GeoIP database lifecycle
    ClientsMixin,             # Managed Nostr client pool
    BaseService[MonitorConfig],
):
```

Cooperative initialization via MRO: `super().__init__(**kwargs)` in every mixin. The method resolution order handles the initialization chain automatically.

The `run()` cycle:
1. Update GeoIP databases (download if missing/expired)
2. Open GeoIP readers (in thread pool — blocking I/O)
3. Publish profile (Kind 0) if due (configurable interval)
4. Publish monitor announcement (Kind 10166) if due
5. For each relay (ordered by "least recently checked"):
   - Acquire per-network semaphore
   - NIP-11 fetch with retry
   - NIP-66 RTT with retry (can apply PoW if relay requires `min_pow_difficulty`)
   - 5 NIP-66 tests in parallel with retry
   - Return `CheckResult` (NamedTuple with 7 nullable fields)
6. Publish discovery events (Kind 30166) for relays with data
7. Persist metadata (atomic cascade) + monitoring state
8. Close GeoIP readers

**Publication interval state management**: the monitor uses the `service_state` table with type `PUBLICATION` to track when it last published each event type. If the interval hasn't elapsed, it skips publishing. This prevents publishing the same event thousands of times per hour.

#### Synchronizer (449 lines) — Event Archiving with Binary-Split Windowing

- **Relay shuffle**: `random.shuffle()` prevents thundering herd when multiple instances hit the same relays in the same order
- **Cursor-based resumption**: per-relay cursor `{last_synced_at: timestamp}` in the DB. On restart, resumes where it left off.
- **Binary-split windowing**: data-driven time windows with completeness verification. If a relay's response appears incomplete, the window is split in half and retried — ensuring no events are missed even from high-volume relays.
- **Per-relay overrides**: custom timeouts for high-traffic relays
- **Event validation**: signature verification (`evt.verify()`), temporal bounds, null bytes. Invalid events counted but not inserted.
- **`allow_insecure`**: configurable SSL fallback for relays with invalid certificates, same as Validator and Dvm.

#### Refresher (92 lines) — The Simplest

Sequential, no parallelism. For each view in the configured list: `REFRESH MATERIALIZED VIEW CONCURRENTLY view_name`. One view failing doesn't block the others.

#### Api (389 lines) — Dynamic REST API

- **Automatic schema discovery**: on startup, queries `information_schema` and `pg_catalog` to discover tables, columns, PKs, unique indexes. Generates endpoints automatically for each enabled table.
- **Parameterized query builder**: filters (`col=value`, `col=>=:100`, `col=ILIKE:%pattern%`), sorting, pagination. Operator whitelist. Type transforms for bytea (hex), timestamp (text), numeric (float).
- **CatalogError**: client-safe exception that never exposes raw DB errors. Controlled messages or validated identifiers only.
- **Offset limit**: 100,000 max to prevent deep pagination abuse.
- **Middleware**: request/response logging, timing, status code tracking, configurable CORS.

#### Dvm (396 lines) — Nostr Data Vending Machine (NIP-90)

- **NIP-90 protocol**: listens for Kind 5050 requests via WebSocket, responds with results (Kind 6050) or errors (Kind 7000) on the Nostr network
- **Same Catalog as API**: uses the same query builder for consistency
- **Request deduplication**: in-memory set (flushed at 10K) + temporal `since` window to prevent duplicate processing
- **Per-table pricing**: each table can have a price in millisatoshi. If the bid is insufficient, publishes `payment_required` (Kind 7000)
- **NIP-89 announcement**: on startup publishes Kind 31990 with available tables

### `services/common/` — Shared Code

**Query Functions** (1,012 lines total across 6 modules): domain SQL queries are distributed across service-specific `queries.py` modules (monitor 248, finder 260, validator 241, synchronizer 98, seeder 29) plus a shared `common/queries.py` (136 lines). Parameterized `$1`/`$2` placeholders (never f-strings for values). Timeouts from config. Batching via `_batched_insert()` that splits records into chunks of `max_size`. Composite cursors for deterministic pagination.

**Mixins** (423 lines, 5 cooperative mixins):
- **ConcurrentStreamMixin**: `_iter_concurrent()` with `asyncio.TaskGroup` + `asyncio.Queue` streaming — results are yielded as workers complete, not buffered until all finish.
- **NetworkSemaphoresMixin**: maps `NetworkType → asyncio.Semaphore`. Different networks get different concurrency. `LOCAL`/`UNKNOWN` return `None` (no concurrency limiting).
- **GeoReaderMixin**: GeoIP2 database lifecycle (opening in thread pool via `asyncio.to_thread()`, synchronous close). Idempotent — opening or closing twice is safe.
- **ClientsMixin**: managed Nostr client pool with per-relay proxy URL resolution, auto-configured from `MonitorConfig`.
- **CatalogAccessMixin**: schema discovery + table access policy, used by Api and Dvm for safe parameterized queries.

**Catalog** (532 lines): the safe query builder shared between Api and Dvm. Schema discovery via `information_schema` + `pg_catalog`. Whitelist-by-construction: only tables/columns discovered from the DB can be used. Type transforms. Operator validation. `CatalogError` for client-safe errors.

---

## Extensibility and Reusability — The Hardest Challenge

The most complex part of the project wasn't implementing individual services. It was **designing a system that works both as a deployable application and as a reusable Python library**, and that can be extended without modifying existing code.

### BigBrotr as a Python Library

The package is designed for independent use at any level of the DAG:

```python
# Just relay URL validation (models, zero I/O)
from bigbrotr.models import Relay, NetworkType
relay = Relay("wss://relay.damus.io")  # Validates, parses, detects network

# Just DB infrastructure (core)
from bigbrotr.core import Brotr, Pool
brotr = Brotr.from_dict({"pool": {"database": {...}}})

# Just health checking a relay (nips, I/O)
from bigbrotr.nips import Nip11, Nip66
nip11 = await Nip11.create(relay)
nip66 = await Nip66.create(relay, selection=Nip66Selection(dns=False))

# Full service with lifecycle, metrics, logging
from bigbrotr import Monitor
```

The package's `__init__.py` exposes **32 symbols** with lazy loading: imports happen only on first access, reducing startup time for consumers who use only a subset. The diamond DAG guarantees you can import any subset without unnecessary dependencies and without circular imports.

### Adding a New Service — Minimal Boilerplate

A new service requires only **~50 lines of code** and 4-5 files. You write just the business logic; all infrastructure is "free":

```python
from bigbrotr.core.base_service import BaseService, BaseServiceConfig

class MyConfig(BaseServiceConfig):
    batch_size: int = 100

class MyService(BaseService[MyConfig]):
    SERVICE_NAME = ServiceName.MYSERVICE
    CONFIG_CLASS = MyConfig

    async def run(self) -> None:
        relays = await fetch_all_relays(self._brotr)
        # ... business logic ...
```

Registration: one line in the `SERVICE_REGISTRY` in `__main__.py` + a YAML config file. Then `python -m bigbrotr myservice --config config/services/myservice.yaml`.

What you get for free:

| Feature | Provided by | Notes |
|---------|------------|-------|
| YAML config parsing | `BaseService.from_yaml()` | Standard Pydantic fields |
| Structured logging | `self._logger` | key=value with JSON output |
| Prometheus metrics | `SERVICE_COUNTER`, `GAUGE` | `/metrics` endpoint on port 8000 |
| Graceful shutdown | `run_forever()` | SIGINT/SIGTERM → clean shutdown |
| Failure tracking | `run_forever()` | Consecutive error counter |
| DB access | `self._brotr` | Pool, queries, transactions, stored procedures |
| Connection pooling | `Pool` | Retry/backoff, health-checked acquisition |
| Run/wait cycle | `run_forever()` | Configurable interval, interruptible wait |

You don't have to manage connections, logging, metrics, shutdown, or retry — the framework handles all of it. Your service just implements `async def run()`.

### Adding New NIPs and MetadataTypes — The Hardest Part

This was the most complex architectural challenge: modeling the `nips/` layer with **robust validation that doesn't block future extensions**.

The problem: today BigBrotr supports 7 metadata types (NIP-11 info + 6 NIP-66 tests). Tomorrow someone might want to add NIP-66 DNSSEC, or an entirely new NIP (e.g., NIP-XX for content analysis). The model must accommodate new types **without modifying existing code and without database migrations**.

The solution is a **3-level forward-compatible schema**.

**Level 1 — Database**: the `metadata` table accepts any string as `type`. Adding `NIP66_DNSSEC` requires no ALTER TABLE. Content is free-form JSONB. The SHA-256 hash is computed in Python, not in the DB. Existing code ignores unknown types.

**Level 2 — Python Models**: `MetadataType` is a `StrEnum`. Adding a member is one line:

```python
class MetadataType(StrEnum):
    NIP11_INFO = "nip11_info"
    NIP66_RTT = "nip66_rtt"
    # ...
    NIP66_DNSSEC = "nip66_dnssec"  # NEW: one line, zero breaking change
```

The `Metadata` model is **agnostic** about the internal data structure. It accepts any `Mapping[str, Any]`, sanitizes it, serializes to canonical JSON, and computes the hash. The same model works for NIP-11, NIP-66, and any future NIP without modifications.

**Level 3 — NIP Implementation**: every NIP follows the `BaseNip` contract:

```python
class BaseNip:
    @classmethod
    async def create(cls, relay, **kwargs) -> Self:
        """Async factory. NEVER raises exceptions."""
        ...

    def to_relay_metadata_tuple(self) -> tuple[RelayMetadata | None, ...]:
        """Converts results to DB-ready records."""
        ...
```

Adding a new NIP-66 test requires:
1. A `StrEnum` member in `MetadataType` (1 line)
2. A frozen data model with `_FIELD_SPEC` for declarative parsing (~30 lines)
3. An `execute()` method with the I/O logic (~50 lines)
4. A field in `Nip66Selection` to enable/disable (1 line)
5. A field in the `Nip66` orchestrator (1 line)

**The Monitor doesn't change.** It calls `Nip66.create()` and iterates over results. New tests appear automatically because the Monitor has no switch/case on types — it uses `to_relay_metadata_tuple()` which returns all results (those that are `None` get skipped).

The `Selection`/`Options`/`Dependencies` pattern lets you add parameters without changing signatures:
- **Selection**: which tests to run (boolean flag per type)
- **Options**: how to run them (e.g., `allow_insecure` for SSL)
- **Dependencies**: what's available (Nostr keys, GeoIP databases)

If a dependency is `None`, the test is silently skipped — same code handles deployments with and without optional features.

### Configurable Deployments — Zero Code

Everything is configurable via YAML without touching a single line of code:

- **Pool**: size, timeouts, retry, backoff strategy
- **Services**: enabled networks (clearnet/tor/i2p/loki), per-network concurrency, proxy URLs, batch size, intervals, limits, cleanup thresholds
- **Monitor**: enabled checks, retry config per test, publication intervals, GeoIP database paths
- **Synchronizer**: per-relay timeout overrides, temporal ranges, event filters
- **Api/Dvm**: exposed tables, pagination limits, CORS, per-table pricing

**Creating a new deployment** requires zero code:
1. Copy `deployments/bigbrotr/` to `deployments/mydeployment/`
2. Edit the YAML config files
3. Optionally customize the `event` table schema (the only table with a variable schema — from a minimal `id`-only version to the full version with all fields)
4. `docker compose up` — the parametric Dockerfile (`ARG DEPLOYMENT`) handles everything

The result: you can have N different deployments of the same codebase, each with a different schema, different ports, different configurations — and zero code duplication.

### Backward Compatibility by Design

The fundamental principle: **extend, never modify**.

- New `MetadataType` → the DB accepts it without migration, existing code ignores it
- New services → hook into the existing framework, use the same queries, same pool, same lifecycle
- New NIPs → follow the `BaseNip` contract, the Monitor orchestrates them transparently
- New deployments → same Dockerfile, same CI, just different config

This means you can build heavy, complex services on top of the BigBrotr infrastructure without having to modify it. You get a managed pool, DB facade, logging, metrics, lifecycle, and a validated and immutable domain model — all ready to go.

---

## Database Schema

### Core Tables (6)

```sql
-- Relay: identity + network
CREATE TABLE relay (
    url TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    discovered_at BIGINT NOT NULL
);

-- Event: complete Nostr event
CREATE TABLE event (
    id BYTEA PRIMARY KEY,
    pubkey BYTEA NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    tagvalues TEXT[] GENERATED ALWAYS AS (tags_to_tagvalues(tags)) STORED,
    content TEXT NOT NULL,
    sig BYTEA NOT NULL
);

-- Junction: which event was seen on which relay
CREATE TABLE event_relay (
    event_id BYTEA REFERENCES event(id),
    relay_url TEXT REFERENCES relay(url),
    seen_at BIGINT NOT NULL,
    PRIMARY KEY (event_id, relay_url)
);

-- Metadata: content-addressed (SHA-256 hash)
CREATE TABLE metadata (
    id BYTEA NOT NULL,
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (id, type)
);

-- Time-series junction: health check history per relay
CREATE TABLE relay_metadata (
    relay_url TEXT REFERENCES relay(url),
    metadata_id BYTEA,
    metadata_type TEXT,
    generated_at BIGINT NOT NULL,
    PRIMARY KEY (relay_url, generated_at, metadata_type),
    FOREIGN KEY (metadata_id, metadata_type) REFERENCES metadata(id, type)
);

-- Generic key-value store for service state
CREATE TABLE service_state (
    service_name TEXT,
    state_type TEXT,
    state_key TEXT,
    state_value JSONB NOT NULL DEFAULT '{}',
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (service_name, state_type, state_key)
);
```

### Schema Design Decisions

**`tagvalues` as GENERATED ALWAYS STORED**: computed column, calculated once on INSERT. Feeds a GIN index for containment queries (`WHERE tagvalues @> ARRAY['<id>']`). Avoids recalculation on every query.

**Composite FK in `relay_metadata`**: `(metadata_id, metadata_type)` references `metadata(id, type)`. Maintains referential integrity on the pair, not just the hash.

**Composite PK in `relay_metadata`**: `(relay_url, generated_at, metadata_type)`. Each relay can have many instances of each metadata type over time — it's a time-series of health checks.

**`service_state` as generic store**: 3-field PK `(service_name, state_type, state_key)`. Each service uses it differently: Finder for cursors, Validator for candidates, Monitor for last-check timestamps, Synchronizer for sync cursors. Zero schema migration when adding a new state type.

### Stored Procedures (25)

**Level 1 — Single operations**: `relay_insert()`, `event_insert()`, `metadata_insert()`, `service_state_upsert()`. All accept bulk arrays (`UNNEST($1::text[], $2::text[], ...)`) for batch insertion.

**Level 2 — Atomic cascades**:
- `event_relay_insert_cascade()`: in a single SQL call, inserts relay (if not exists) + event (if not exists) + junction. `DISTINCT ON (event_id, relay_url)` for intra-batch deduplication. Atomic.
- `relay_metadata_insert_cascade()`: relay + metadata + junction in one call.

**Why two levels:** Synchronizer can use `event_relay_insert()` when events already exist, or the cascade when discovering new relays with new events.

**Batched cleanup**: `orphan_metadata_delete()` and `orphan_event_delete()` remove orphaned records in batches of 10,000 to limit lock duration.

### Materialized Views (11)

Pre-compute aggregate statistics so the API doesn't need expensive JOINs at runtime:

1. `relay_metadata_latest` — Latest snapshot per relay/type (DISTINCT ON pattern)
2. `event_stats` — Global event counts (singleton with `singleton_key`)
3. `relay_stats` — Per-relay stats with LATERAL join for average RTT from last 10 measurements
4. `kind_counts` — Distribution by event kind
5. `kind_counts_by_relay` — Distribution by relay
6. `pubkey_counts` — Global author activity
7. `pubkey_counts_by_relay` — Per-relay author activity (HAVING COUNT >= 2)
8. `network_stats` — Aggregate by network type
9. `relay_software_counts` — Relay software distribution (from NIP-11)
10. `supported_nip_counts` — NIP adoption (CROSS JOIN LATERAL jsonb_array_elements)
11. `event_daily_counts` — Daily time-series (UTC dates)

**Refresh strategy**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index on each view. The Refresher updates them in dependency order (3 levels).

### Indexes (31)

Strategically placed to support the query patterns of each service:

- **7 on `event`**: timeline (DESC), by kind, by author, compound (author + kind + timeline), GIN on tagvalues, cursor-based pagination (ASC)
- **3 on `event_relay`**: by relay, by timestamp, compound for index-only scan
- **3 on `relay_metadata`**: by timestamp, compound FK, latest-per-type
- **3 on `service_state`**: by service, by type, expression index on JSON for Validator
- **15 on materialized views**: unique indexes required for CONCURRENTLY

---

## Deployment Infrastructure

### Docker: 13 Containers on 2 Networks

```yaml
# Network isolation
networks:
  bigbrotr-data-network:        # PostgreSQL + services
  bigbrotr-monitoring-network:  # Prometheus + Grafana + AlertManager
```

| Container | Role |
|-----------|------|
| postgres | Primary database (PostgreSQL 16) |
| pgbouncer | Connection pooling (transaction mode) |
| tor | SOCKS5 proxy for .onion relays |
| seeder | Bootstrap (one-shot, `restart: no`) |
| finder | Relay discovery |
| validator | WebSocket validation |
| monitor | NIP-11 + NIP-66 health checks |
| synchronizer | Event archiving |
| refresher | Materialized view refresh |
| api | REST API (FastAPI) |
| dvm | Nostr DVM (NIP-90) |
| postgres-exporter | PostgreSQL metrics for Prometheus |
| prometheus | Metrics collection (30 day retention) |
| alertmanager | Alert routing |
| grafana | Visualization dashboards |

Plus I2P and Lokinet as optional containers (commented out but documented for enablement).

**Dependency graph**: PgBouncer depends on PostgreSQL (`service_healthy`). All services depend on PgBouncer + Tor (`service_healthy`). Grafana depends on Prometheus.

**Health checks**: PostgreSQL uses `pg_isready`. BigBrotr services use `/metrics` (port 8000). Api uses `/health` (port 8080). Prometheus and Grafana use their native endpoints.

### Parametric Multi-Stage Dockerfile

A single Dockerfile serves 2 deployment variants (`bigbrotr` and `lilbrotr`):

**Stage 1 (Builder)**: `python:3.11.14-slim` base, `uv` from `ghcr.io/astral-sh/uv:0.10.2` (fast, deterministic build tool), layer caching with dependencies separated from source code, BuildKit cache mounts to avoid re-downloading.

**Stage 2 (Production)**: non-root user (UID 1000, name = deployment), runtime-only libraries (libpq5, libsecp256k1-dev), pip/setuptools removed from base image (reduced attack surface), `tini` as PID 1 (proper signal handling, no zombie processes), explicit `STOPSIGNAL SIGTERM`, config copied from specific deployment.

### PgBouncer

Connection pooler in front of PostgreSQL. Connection multiplexing to reduce DB load. Password templating via custom entrypoint. 300s safety net timeout.

### Monitoring Stack

- **Prometheus** (v2.51.0): scraping every 30s from all services + postgres-exporter. 30-day TSDB retention. 7 alert rules covering service health, failure rates, cycle performance, database connections, cache hit ratios, and view refresh failures.
- **AlertManager** (v0.27.0): grouping by `alertname`/`service`. Critical alerts repeated every 1h, normal every 4h.
- **Grafana** (10.4.1): automatic datasource + dashboard provisioning. Zero manual setup.
- **postgres-exporter** (v0.16.0): PostgreSQL metrics (connections, cache hit ratio, table stats).

---

## CI/CD Pipeline

### GitHub Actions (306 lines)

```
Trigger: push/PR on main/develop (excludes docs, README)

┌─────────────────────────────────────────────┐
│ pre-commit (10 min)                         │
│ ruff, mypy, pre-commit hooks                │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┼────────────────────────────────┐
       │       │                                │
       ▼       ▼                                ▼
  unit-test   integration-test               docs
  (matrix     (testcontainers PG)            (mkdocs
   3.11-3.14)  (10 min)                      --strict)
  (15 min)                                   (5 min)
  (codecov)
       │       │                                │
       └───────┼────────────────────────────────┘
               │
               ▼
           build (main/develop only)
           (matrix: bigbrotr/lilbrotr)
           (Trivy security scan)
           (SARIF → GitHub Security)
           (20 min)
               │
               ▼
           ci-success (gate for branch protection)
```

Key details:
- **Unit test matrix**: Python 3.11, 3.12, 3.13, 3.14 (pre-release, allowed to fail)
- **SQL drift detection**: `tools/generate_sql.py --check` verifies SQL templates match generated files
- **Dependency audit**: `uv-secure uv.lock` for known vulnerabilities
- **Trivy scan**: gates on CRITICAL/HIGH, reports MEDIUM. SARIF uploaded to GitHub Security tab.
- **Concurrency**: one run per branch; new pushes cancel previous runs.

### Pre-commit Hooks (23 hooks)

- **File hygiene**: trailing-whitespace, end-of-file-fixer, check-yaml/json/toml, check-large-files (max 1MB), detect-private-key, mixed-line-ending (LF)
- **Python**: ruff (lint + format), mypy (strict on src/)
- **SQL**: sqlfluff (PostgreSQL dialect)
- **Security**: detect-secrets with baseline
- **Dependency**: uv-lock (verifies pyproject.toml ↔ uv.lock sync)
- **Docker**: hadolint
- **Markdown**: markdownlint-cli
- **Spell check**: codespell

---

## Recurring Architectural Patterns

A few patterns show up everywhere in the codebase. Recognizing them makes it easier to understand any part of the system.

**Content-Addressed Deduplication**: identical data → same SHA-256 hash → one row in the DB. Trades CPU (Python hashing) for reduced storage and disk I/O. The bottleneck is network, not CPU, so this is a good trade.

**Cascade Atomicity**: stored procedures that insert across multiple tables in a single SQL call. Referential integrity guaranteed even on connection failure.

**Never-Raising Factories**: NIP fetch methods always return a result (with `logs.success` indicating success/failure). Enables batch processing without individual try/catch.

**Interruptible Wait**: `asyncio.wait_for(event.wait(), timeout)` for cycles with immediate shutdown. Never bare `asyncio.sleep()` (not interruptible).

**Per-Network Semaphores**: different concurrency for clearnet, Tor, I2P, Lokinet. Configurable, zero magic numbers.

**Cooperative Multiple Inheritance**: mixins with `super().__init__(**kwargs)` via MRO. No manual `_init_*()` calls.

**Layered Timeouts**: asyncpg → PgBouncer → PostgreSQL. Three independent levels, the tightest wins.

**Coroutine Factory for Retry**: Python coroutines are single-use. Retry creates a fresh coroutine on each attempt.

**Declarative Parsing**: `FieldSpec` + `parse_fields()` for type-safe parsing of untrusted JSON. Silent failure for invalid fields.

**Ground Truth > Self-Report**: NIP-66 probe results are authoritative over NIP-11 relay self-reports.

---

## Conscious Trade-offs

Every architectural decision is a trade-off. Here are the ones that mattered most and why we landed where we did:

| Decision | Upside | Downside | Reasoning |
|----------|--------|----------|-----------
| DB as inter-service channel | Decoupling, fault isolation, observability | Higher latency than RPC | Not real-time; 1-5 min cycles are fine |
| Content-addressed dedup | Less storage, less disk I/O | CPU for hashing in Python | Network is the bottleneck, not CPU |
| Materialized views | Fast API queries, zero JOINs at runtime | Slightly stale data (periodic refresh) | Analytics don't need real-time data |
| Frozen dataclasses | Correctness, thread-safety, stable hash | `object.__setattr__` verbosity | Correctness > ergonomics |
| Stored procedures for mutations | Atomicity, fewer roundtrips, logic in DB | More complex SQL, two languages | Acceptable trade for data integrity |
| `ws://` for overlay, `wss://` for clearnet | Overlay handles encryption; no TLS overhead | Non-uniform scheme | Semantically correct: TLS is redundant on Tor |
| No message queue | Less infrastructure to maintain | No native backpressure | DB + semaphores are sufficient for this workload |

---

## By the Numbers

| Dimension | Value |
|-----------|-------|
| Source code | ~18,000 lines Python, 88 modules |
| Tests | ~2,739 unit + ~216 integration (~2,955 total) |
| SQL | 1,759 lines, 10 init files |
| Services | 8 independent |
| Stored procedures | 25 |
| Materialized views | 11 |
| Indexes | 31 (16 table + 15 matview) |
| Docker containers | 13 (+ 2 optional) |
| Core dependencies | 18 |
| Dev dependencies | 18 |
| Pre-commit hooks | 23 |
| Coverage | 80% branch coverage (enforced) |

---

## Closing Thoughts

BigBrotr started as "let's index some Nostr relays" and turned into a distributed system with 8 services, 25 stored procedures, 11 materialized views, and a monitoring stack that could probably run a small startup.

The most important lesson was resisting the urge to solve future problems today. The forward-compatible schema wasn't designed on day one — it evolved from real pain points when adding the second and third metadata type. The mixin system emerged when Monitor's `__init__` hit 40 lines. The configurable deployments came from actually needing two different setups.

Every pattern in this codebase exists because of a real problem, not because it looked good on a whiteboard. That's the difference between architecture and architecture astronautics.

If you want to explore the code, it's all open source. Questions, feedback, and contributions are welcome.
