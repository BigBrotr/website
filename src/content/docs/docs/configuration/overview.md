---
title: Configuration Overview
description: How BigBrotr's YAML configuration system works.
---

BigBrotr uses YAML configuration files with Pydantic validation. Every service has two configuration sources: a core Brotr config (shared) and a service-specific config.

## Configuration Files

```
config/
├── brotr.yaml              # Core: pool, batch, timeouts
└── services/
    ├── seeder.yaml
    ├── finder.yaml
    ├── validator.yaml
    ├── monitor.yaml
    ├── refresher.yaml
    ├── synchronizer.yaml
    ├── api.yaml
    └── dvm.yaml
```

## Loading Order

1. CLI flags override file paths: `--brotr-config`, `--config`
2. Default paths: `config/brotr.yaml`, `config/services/<service>.yaml`
3. YAML files are parsed and validated through Pydantic models
4. Environment variables can override specific values

## CLI Interface

```bash
python -m bigbrotr <service> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--config PATH` | `config/services/<service>.yaml` | Service-specific config |
| `--brotr-config PATH` | `config/brotr.yaml` | Core database/pool config |
| `--log-level LEVEL` | `INFO` | DEBUG, INFO, WARNING, ERROR |
| `--once` | `false` | Run a single cycle then exit |

## Environment Variables

Environment variables in YAML files are interpolated at load time using `${VAR_NAME}` syntax:

```yaml
pool:
  dsn: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pgbouncer:5432/${POSTGRES_DB}
```

## Next Steps

- [Core Configuration](/docs/configuration/core/) — pool, Brotr, and timeout settings.
- [Service Configuration](/docs/configuration/services/) — per-service settings.
- [Deployments](/docs/configuration/deployments/) — BigBrotr vs LilBrotr.
