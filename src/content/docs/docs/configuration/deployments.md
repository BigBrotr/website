---
title: Deployments
description: BigBrotr and LilBrotr deployment configurations.
---

BigBrotr ships with two deployment configurations that demonstrate different use cases. Both use the same codebase and all eight services.

## Deployment Structure

```
deployments/
├── Dockerfile              # Shared parametric Dockerfile
├── bigbrotr/               # Full deployment
│   ├── docker-compose.yaml
│   ├── .env.example
│   ├── config/
│   │   ├── brotr.yaml
│   │   └── services/*.yaml
│   ├── postgres/
│   │   └── init/*.sql      # 10 SQL files, 25 stored functions
│   ├── pgbouncer/
│   │   └── pgbouncer.ini
│   └── monitoring/
│       ├── prometheus/
│       └── grafana/
└── lilbrotr/               # Lightweight deployment
    ├── docker-compose.yaml
    ├── .env.example
    ├── config/
    ├── postgres/
    ├── pgbouncer/
    └── monitoring/
```

## BigBrotr

The full deployment for comprehensive Nostr network observation.

- All eight services with full configuration (13 Docker containers total)
- All 11 materialized views
- PostgreSQL with PgBouncer (transaction mode)
- Prometheus metrics collection with 7 alert rules
- Grafana dashboards with service overview
- Docker Compose with resource limits and health checks
- Two Docker networks: `data` (services + database) and `monitoring`

### Docker Compose Services

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | PostgreSQL 16 | Database with schema initialization |
| `pgbouncer` | PgBouncer | Connection pooling (transaction mode) |
| `prometheus` | Prometheus | Metrics collection and alerting |
| `grafana` | Grafana | Monitoring dashboards |

### PgBouncer Configuration

Two connection pools:

| Pool | Users | Pool Size | Purpose |
|------|-------|-----------|---------|
| `bigbrotr` | writer | 10 | All eight services |
| `bigbrotr_readonly` | reader | 8 | API, DVM, monitoring |

## LilBrotr

A lightweight deployment (~60% disk savings) with the same architecture, demonstrating BigBrotr's customizability.

- Same eight services and all 11 materialized views
- Smaller batch sizes and longer sleep intervals
- Lower resource limits
- Same monitoring stack
- Event table stores only id/pubkey/created_at/kind/tagvalues (tags/content/sig are nullable and always NULL)

The key difference is configuration tuning and event storage, not code changes. LilBrotr processes less data per cycle and stores only event metadata, using the same codebase.

## Parametric Dockerfile

Both deployments share a single Dockerfile:

```dockerfile
ARG DEPLOYMENT
# ... builds for the specified deployment
```

Build with:

```bash
docker build --build-arg DEPLOYMENT=bigbrotr -t bigbrotr .
docker build --build-arg DEPLOYMENT=lilbrotr -t lilbrotr .
```

## Environment Variables

Both deployments use `.env` files for secrets and runtime configuration:

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | PostgreSQL superuser |
| `POSTGRES_PASSWORD` | Superuser password |
| `POSTGRES_DB` | Database name |
| `WRITER_USER` | Writer services user |
| `WRITER_PASSWORD` | Writer password |
| `READER_USER` | Read-only user |
| `READER_PASSWORD` | Reader password |
| `NOSTR_PRIVATE_KEY` | Monitor event publishing key (optional) |

## Security

Both deployments follow security best practices:

- All ports bound to `127.0.0.1` (no external exposure by default)
- Non-root container execution (UID 1000)
- `tini` as PID 1 for proper signal handling
- SCRAM-SHA-256 authentication for PostgreSQL
- Health checks via `pg_isready` and `/metrics` endpoints

## Creating Your Own Deployment

To create a custom deployment:

1. Copy an existing deployment directory.
2. Modify `config/brotr.yaml` for your database settings.
3. Adjust `config/services/*.yaml` for your batch sizes and intervals.
4. Update `.env.example` with your database name and credentials.
5. Modify `pgbouncer/pgbouncer.ini` with your pool names.
6. Build with `--build-arg DEPLOYMENT=yourdeployment`.

## Next Steps

- [Quick Start](/docs/getting-started/quick-start/) — get a deployment running.
- [Core Configuration](/docs/configuration/core/) — detailed config parameters.
