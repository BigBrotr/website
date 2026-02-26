---
title: Core Configuration
description: Pool, Brotr, batch, and timeout configuration.
---

The core configuration file (`config/brotr.yaml`) controls the database connection pool, batch processing parameters, and timeout values shared across all services.

## BrotrConfig

```yaml
# config/brotr.yaml
pool:
  dsn: postgresql://writer:password@pgbouncer:5432/bigbrotr
  min_size: 2
  max_size: 10
  max_inactive_connection_lifetime: 300

batch:
  max_size: 1000

timeouts:
  query: 60       # seconds for individual queries
  batch: 120      # seconds for batch operations
  cleanup: 90     # seconds for cleanup operations
  refresh: null   # null = no timeout for materialized view refresh
```

## Pool Configuration

The `PoolConfig` controls the asyncpg connection pool:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dsn` | — | PostgreSQL connection string |
| `min_size` | `2` | Minimum pool connections |
| `max_size` | `10` | Maximum pool connections |
| `max_inactive_connection_lifetime` | `300` | Seconds before idle connections are closed |

The pool includes automatic retry with exponential backoff for transient connection failures. Health checks verify connection viability before use.

## Batch Configuration

Controls batch sizes for database operations:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_size` | `1000` | Maximum items per batch operation (1–100,000) |

## Timeout Configuration

Centralized timeouts prevent runaway queries:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | `60` | Per-query timeout in seconds |
| `batch` | `120` | Batch operation timeout |
| `cleanup` | `90` | Cleanup operation timeout |
| `refresh` | `null` | Materialized view refresh timeout (null = unlimited) |

Timeouts are config-driven — query functions in `services/common/queries.py` never accept timeout parameters directly. They read from `TimeoutsConfig`.

## Connection String

The DSN (Data Source Name) uses the standard PostgreSQL format:

```
postgresql://user:password@host:port/database
```

In Docker deployments, services connect through PgBouncer:

```yaml
pool:
  dsn: postgresql://writer:${WRITER_PASSWORD}@pgbouncer:5432/bigbrotr
```

## Next Steps

- [Service Configuration](/docs/configuration/services/) — per-service settings.
- [Deployments](/docs/configuration/deployments/) — BigBrotr vs LilBrotr.
