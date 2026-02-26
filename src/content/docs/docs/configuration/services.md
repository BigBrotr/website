---
title: Service Configuration
description: Per-service YAML configuration with network-specific settings.
---

Each service has its own YAML configuration file in `config/services/`. All configurations are validated through Pydantic models, ensuring type safety and sensible defaults.

## Common Parameters

Every continuous service configuration includes:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | `float` | `300.0` | Seconds between run cycles (minimum 60) |
| `max_consecutive_failures` | `int` | `10` | Failures before the service stops |
| `metrics.enabled` | `bool` | `false` | Enable Prometheus metrics endpoint |
| `metrics.port` | `int` | `8000` | Metrics HTTP port |
| `metrics.host` | `str` | `127.0.0.1` | Metrics bind address |

## Network Configuration

Services that perform network I/O include per-network blocks nested under a `networks:` key:

```yaml
networks:
  clearnet:
    timeout: 30
    max_tasks: 50

  tor:
    enabled: true
    timeout: 60
    max_tasks: 10
    proxy_url: socks5://tor:9050

  i2p:
    enabled: true
    timeout: 60
    max_tasks: 5
    proxy_url: socks5://i2p:4447

  loki:
    enabled: true
    timeout: 45
    max_tasks: 5
    proxy_url: socks5://lokinet:1080
```

Each network type has its own Pydantic model:

| Model | Fields |
|-------|--------|
| `ClearnetConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |
| `TorConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |
| `I2pConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |
| `LokiConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |

## Service-Specific Configuration

### Seeder

```yaml
# config/services/seeder.yaml
seed:
  file_path: seeds/relays.txt
  to_validate: true
```

### Finder

```yaml
# config/services/finder.yaml
interval: 300

concurrency:
  max_parallel_api: 5
  max_parallel_events: 3

events:
  enabled: true
  batch_size: 500

api:
  sources:
    - url: https://api.nostr.watch/v1/online
      jmespath: "[].url"
```

### Validator

```yaml
# config/services/validator.yaml
interval: 120

processing:
  chunk_size: 100

networks:
  clearnet:
    timeout: 15
    max_tasks: 50
  tor:
    enabled: true
    timeout: 45
    max_tasks: 10
    proxy_url: socks5://tor:9050

cleanup:
  enabled: false
  max_failures: 100
```

### Monitor

```yaml
# config/services/monitor.yaml
interval: 600

processing:
  chunk_size: 200
  allow_insecure: false
  compute:
    nip11_info: true
    nip66_rtt: true
    nip66_ssl: true
    nip66_geo: true
    nip66_net: true
    nip66_dns: true
    nip66_http: true

networks:
  clearnet:
    timeout: 30
    max_tasks: 100

geo:
  city_database_path: static/GeoLite2-City.mmdb
  asn_database_path: static/GeoLite2-ASN.mmdb
  geohash_precision: 9
```

### Refresher

```yaml
# config/services/refresher.yaml
interval: 3600

refresh:
  views:
    - relay_metadata_latest
    - event_stats
    - relay_stats
    - kind_counts
    - kind_counts_by_relay
    - pubkey_counts
    - pubkey_counts_by_relay
    - network_stats
    - relay_software_counts
    - supported_nip_counts
    - event_daily_counts
```

### Synchronizer

```yaml
# config/services/synchronizer.yaml
interval: 300

filter:
  limit: 500

time_range:
  hours: 24

networks:
  clearnet:
    timeout: 30
    max_tasks: 25

timeouts:
  relay_clearnet: 30
  relay_tor: 90
```

## Validation

All configurations are validated at load time through Pydantic. Invalid values (wrong types, missing required fields, out-of-range numbers) cause an immediate error with a clear message. The Monitor's Nostr key configuration is validated with a `model_validator` that ensures the key is valid at startup, not at first use.

## Next Steps

- [Core Configuration](/docs/configuration/core/) — pool, Brotr, and timeout settings.
- [Deployments](/docs/configuration/deployments/) — BigBrotr vs LilBrotr.
