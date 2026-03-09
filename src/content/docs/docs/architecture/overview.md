---
title: Architecture Overview
description: The diamond DAG dependency structure, design principles, and high-level system design.
---

BigBrotr's architecture follows a **diamond DAG** (Directed Acyclic Graph) dependency structure. Every import flows strictly downward through well-defined layers, preventing circular dependencies and ensuring clean separation of concerns.

## Diamond DAG

```
              services          Orchestration
             /   |   \
          core  nips  utils    Infrastructure
             \   |   /
              models           Pure domain types
```

**Five packages, one rule: imports only flow downward.**

| Layer | Packages | Responsibility |
|-------|----------|---------------|
| Top | `services` | Business logic. Eight independent services that orchestrate discovery, monitoring, archiving, and data access. |
| Middle | `core` | Connection pool, database facade, base service, logging, metrics. |
| Middle | `nips` | Protocol-aware I/O. NIP-11 relay information, NIP-66 health monitoring. Depends on utils and models. |
| Middle | `utils` | Network primitives. DNS resolution, Nostr key management, WebSocket/HTTP transport, SOCKS5 proxy. |
| Bottom | `models` | Pure frozen dataclasses. Zero I/O, zero `bigbrotr` imports. Uses only stdlib. |

### Import Rules

- **Same package**: relative imports (`from .logger import Logger`)
- **Cross-package**: absolute imports (`from bigbrotr.core.logger import Logger`)
- **models layer**: stdlib only (`import logging`)
- **No upward imports**: `models` never imports from `core`; `core` never imports from `services`.
- **No parent-relative imports**: enforced by ruff rule `ban-relative-imports = "parents"`.

## Design Principles

### Independent Services

All eight services run as independent processes. They communicate exclusively through the shared PostgreSQL database. There are no message queues, no gRPC calls, no inter-service APIs. Each service can start, stop, scale, and fail independently without affecting the others.

### Immutable Domain Models

Every model is a frozen dataclass with `__slots__`. Instances are immutable after construction. Validation happens in `__post_init__` — invalid data never escapes the constructor. This fail-fast approach means bugs surface immediately rather than propagating through the system.

### Content-Addressed Deduplication

Metadata objects are hashed with SHA-256. Same data always produces the same hash. The composite primary key `(id, type)` means deduplication operates within each metadata type. The type is NOT included in the hash — deduplication is per-type. This eliminates duplicates at the data layer without application-level coordination.

### Database as Integration Point

The PostgreSQL database is the single source of truth and the only communication channel between services. All mutations go through stored functions with bulk array parameters. Materialized views provide pre-computed analytics. This design is simple, reliable, and eliminates distributed system failure modes.

### Never Trust Stored Data

When reconstructing objects from the database, BigBrotr re-validates everything. `Relay.from_db_params()` re-parses the URL completely. `Metadata.from_db_params()` recomputes and verifies the hash. This defensive approach catches data corruption at the boundary rather than deep in business logic.

## System Topology

A complete BigBrotr deployment consists of:

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Seeder  │  │  Finder  │  │Validator │  │ Monitor  │
│(one-shot)│  │  (cont.) │  │ (cont.)  │  │ (cont.)  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │             │
     ▼             ▼             ▼             ▼
┌────────────────────────────────────────────────────┐
│                    PgBouncer                       │
│            (transaction pooling)                   │
├────────────────────────────────────────────────────┤
│                   PostgreSQL                       │
│    6 tables · 25 functions · 11 materialized views  │
└────────────────────────────────────────────────────┘
     ▲             ▲             ▲             ▲
     │             │             │             │
┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐
│  Syncer  │  │Refresher │  │   Api    │  │   Dvm    │
│ (cont.)  │  │(sched.)  │  │ (cont.)  │  │ (cont.)  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

Each service connects to PgBouncer, which provides connection pooling in transaction mode. Writer services use the `writer` database user; read-only services (Api, Dvm, monitoring dashboards) use the `reader` user.

## Next Steps

- [Package Structure](/docs/architecture/packages/) — detailed breakdown of each package.
- [Data Flow](/docs/architecture/data-flow/) — how data moves through the system.
- [Services Overview](/docs/services/overview/) — what each service does.
