---
title: Quick Start
description: Get BigBrotr running in minutes with Docker Compose.
---

This guide gets you from zero to a running BigBrotr instance using Docker Compose. You will have all eight services, PostgreSQL with PgBouncer, and Prometheus monitoring operational within minutes.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- 4 GB RAM minimum (8 GB recommended)
- 20 GB disk space for initial data collection

## 1. Clone the Repository

```bash
git clone https://github.com/BigBrotr/bigbrotr.git
cd bigbrotr/deployments/bigbrotr
```

## 2. Configure Environment

Copy the example environment file and review the defaults:

```bash
cp .env.example .env
```

The key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `admin` | PostgreSQL superuser |
| `POSTGRES_PASSWORD` | — | Set a strong password |
| `POSTGRES_DB` | `bigbrotr` | Database name |
| `WRITER_USER` | `writer` | Writer services (all eight services) |
| `READER_USER` | `reader` | Read-only services (API, DVM, monitoring) |

## 3. Start the Stack

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** — database with schema initialization
- **PgBouncer** — connection pooling in transaction mode
- **Prometheus** — metrics collection and alerting

## 4. Run Services

Services run individually. Start with the one-shot Seeder to bootstrap the relay list:

```bash
# Bootstrap relay discovery (one-shot, exits when done)
python -m bigbrotr seeder --once

# Start continuous relay discovery
python -m bigbrotr finder

# Validate discovered relay candidates
python -m bigbrotr validator

# Health monitoring with NIP-11 and NIP-66
python -m bigbrotr monitor

# Materialized view refresh
python -m bigbrotr refresher

# Event collection
python -m bigbrotr synchronizer
```

## 5. Verify

Check that services are writing data:

```bash
# Connect to the database
docker compose exec postgres psql -U admin -d bigbrotr

# Count discovered relays
SELECT count(*) FROM relay;

# Check service states
SELECT service_name, state_type, state_key, state_value, updated_at
FROM service_state ORDER BY updated_at DESC;

# View materialized view stats
SELECT * FROM relay_stats LIMIT 5;
```

## 6. Monitor

Prometheus is available at `http://localhost:9090`. Each service can expose Prometheus metrics when enabled in its configuration:

```yaml
# In any service config
metrics:
  enabled: true
  port: 8000     # default port
  host: 127.0.0.1
  path: /metrics
```

Metrics are disabled by default. When enabled, each service exposes a `/metrics` endpoint on the configured port (default 8000). Assign different ports if running multiple services on the same host.

## Next Steps

- [Architecture Overview](/docs/architecture/overview/) — understand how the system is designed.
- [Configuration Guide](/docs/configuration/overview/) — customize timeouts, batch sizes, and network settings.
- [Deployments](/docs/configuration/deployments/) — learn about BigBrotr vs LilBrotr configurations.
