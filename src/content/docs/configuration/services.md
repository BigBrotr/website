---
title: Service Configuration
description: Per-service YAML configuration with network-specific settings.
---

Each service has its own YAML configuration file in `config/services/`. All configurations are validated through Pydantic models, ensuring type safety and sensible defaults.

## Common Parameters

Every continuous service configuration includes:

| Parameter | Type | Description |
|-----------|------|-------------|
| `sleep_interval` | `int` | Seconds between run cycles |
| `batch_size` | `int` | Items to process per cycle |

## Network Configuration

Services that perform network I/O include per-network blocks:

```yaml
clearnet:
  timeout: 30
  max_concurrent: 50

tor:
  timeout: 60
  max_concurrent: 10
  proxy_url: socks5://tor-proxy:9050

i2p:
  timeout: 60
  max_concurrent: 5
  proxy_url: socks5://i2p-proxy:4447

loki:
  timeout: 45
  max_concurrent: 5
  proxy_url: socks5://lokinet-proxy:1080
```

Each network type has its own Pydantic model:

| Model | Fields |
|-------|--------|
| `ClearnetConfig` | `timeout`, `max_concurrent` |
| `TorConfig` | `timeout`, `max_concurrent`, `proxy_url` |
| `I2pConfig` | `timeout`, `max_concurrent`, `proxy_url` |
| `LokiConfig` | `timeout`, `max_concurrent`, `proxy_url` |

## Service-Specific Configuration

### Seeder

```yaml
seed_files:
  - seeds/relays.txt
```

### Finder

```yaml
sleep_interval: 300
clearnet:
  timeout: 30
  max_concurrent: 50
apis:
  - url: https://api.nostr.watch/v1/online
    jmespath: "[].url"
```

### Validator

```yaml
sleep_interval: 120
batch_size: 100
clearnet:
  timeout: 15
  max_concurrent: 50
tor:
  timeout: 45
  max_concurrent: 10
  proxy_url: socks5://tor-proxy:9050
```

### Monitor

```yaml
sleep_interval: 600
batch_size: 200
clearnet:
  timeout: 30
  max_concurrent: 100
keys:
  private_key_env: NOSTR_PRIVATE_KEY
geoip:
  city_db: /data/geoip/GeoLite2-City.mmdb
  asn_db: /data/geoip/GeoLite2-ASN.mmdb
```

### Refresher

```yaml
sleep_interval: 3600
```

### Synchronizer

```yaml
sleep_interval: 300
batch_size: 50
clearnet:
  timeout: 30
  max_concurrent: 25
```

## Validation

All configurations are validated at load time through Pydantic. Invalid values (wrong types, missing required fields, out-of-range numbers) cause an immediate error with a clear message. The Monitor's Nostr key configuration is validated with a `model_validator` that ensures the key is valid at startup, not at first use.

## Next Steps

- [Core Configuration](/configuration/core/) — pool, Brotr, and timeout settings.
- [Deployments](/configuration/deployments/) — BigBrotr vs LilBrotr.
