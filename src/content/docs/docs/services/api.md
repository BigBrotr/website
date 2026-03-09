---
title: Api
description: Read-only REST API providing HTTP access to all BigBrotr data.
sidebar:
  order: 8
---

The Api is a **continuous** service that provides a read-only REST API built with FastAPI. It exposes all BigBrotr tables and materialized views over HTTP with automatic schema discovery, filtering, sorting, and pagination.

## Purpose

The Api answers: *How can HTTP clients access BigBrotr data?* It dynamically generates routes from the PostgreSQL catalog, so any new table or materialized view is automatically available without code changes.

## How It Works

1. On startup, queries the PostgreSQL catalog to discover available tables and views.
2. Generates REST endpoints for each enabled table/view.
3. Serves HTTP requests with filtering, sorting, and pagination.
4. Runs continuously as a FastAPI/uvicorn server.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (`{"status": "ok"}`) |
| `GET` | `{prefix}/schema` | List all enabled tables with column metadata |
| `GET` | `{prefix}/schema/{table}` | Table detail (columns, types, primary key) |
| `GET` | `{prefix}/{table}` | List rows with pagination, filtering, and sorting |
| `GET` | `{prefix}/{table}/{pk}` | Single row by primary key |

### Query Parameters

Data endpoints support:

- **`limit`** — Maximum rows to return (default configurable).
- **`offset`** — Skip rows for pagination.
- **`sort`** — Sort by column with direction: `sort=col:asc` or `sort=col:desc`.
- **Column filters** — Filter by column value: `col=value` or with operators: `col=op:value`.

Supported filter operators: `=`, `>`, `<`, `>=`, `<=`, `ILIKE`.

### CORS

Cross-Origin Resource Sharing is configurable via `cors_origins`. When set, the Api adds appropriate CORS headers to allow browser-based clients.

## Configuration

```yaml
# config/services/api.yaml
title: "BigBrotr API"
host: 0.0.0.0
port: 8080
route_prefix: /v1

cors_origins:
  - "https://bigbrotr.com"

request_timeout: 30.0  # per-request timeout in seconds
max_page_size: 1000    # hard ceiling on limit parameter
default_page_size: 100 # default if limit not provided

tables:
  relay:
    enabled: true
  event:
    enabled: true
  metadata:
    enabled: true
  relay_metadata:
    enabled: true
  relay_stats:
    enabled: true
  event_stats:
    enabled: true
  kind_counts:
    enabled: true
  network_stats:
    enabled: true
  relay_software_counts:
    enabled: true
  supported_nip_counts:
    enabled: true
```

## Usage

```bash
# Run continuously
python -m bigbrotr api

# Example queries
curl http://localhost:8080/v1/relay?limit=10&sort=discovered_at:desc
curl http://localhost:8080/v1/relay_stats?network=clearnet
curl http://localhost:8080/v1/schema
```

## Shared Infrastructure

The Api uses `CatalogAccessMixin` which provides the `Catalog` class from `services/common/catalog.py` as a database query facade. `Catalog` discovers the schema from PostgreSQL's `information_schema` and `pg_catalog` at startup, then translates HTTP query parameters into safe parameterized SQL queries. It raises `CatalogError` (instead of raw database exceptions) to prevent leaking database internals to clients.

Error responses: 400 (invalid params), 404 (not found/disabled table), 504 (query timeout).
