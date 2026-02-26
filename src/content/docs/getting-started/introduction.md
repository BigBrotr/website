---
title: Introduction
description: What BigBrotr is, why it exists, and what problems it solves.
---

BigBrotr is a modular system for discovering, monitoring, and archiving the Nostr relay network. It answers three fundamental questions:

1. **What relays exist?** Across clearnet, Tor, I2P, and Lokinet.
2. **How healthy are they?** RTT latency, SSL validity, DNS resolution, NIP-11 metadata, NIP-66 monitoring.
3. **What events are they publishing?** Cursor-based synchronization and content-addressed archival.

## Why BigBrotr?

Nostr is a decentralized protocol where events are scattered across hundreds of independent relays. Each relay is ephemeral and can disappear at any time. No single entity sees the whole picture, and unreplicated events are lost forever.

BigBrotr provides complete network visibility by running six independent services that share a PostgreSQL database. There are no message queues, no inter-service APIs, and no complex orchestration layers. Each service has a single responsibility and can run, scale, and fail independently.

## Three Pillars

### Discovery

The Seeder loads relay URLs from seed files and known relay lists. The Finder continuously discovers new relay URLs from NIP-65 events and public APIs. The Validator tests each candidate with a live WebSocket handshake and promotes valid relays to the relay table.

### Health Monitoring

The Monitor performs continuous health checks using NIP-11 relay information documents and NIP-66 relay monitoring events. It measures RTT latency, SSL certificate validity, DNS resolution, geographic location, network reachability, and HTTP status. Results are stored as content-addressed metadata and optionally published as kind 10166/30166 Nostr events.

### Event Archiving

The Synchronizer uses cursor-based pagination to collect and archive Nostr events from validated relays. Content-addressed metadata deduplication (SHA-256) ensures storage efficiency. The Refresher orchestrates periodic refresh cycles for 11 materialized views that power analytics queries.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.11+ with full async/await |
| Database | PostgreSQL 16+ with asyncpg |
| Connection Pooling | PgBouncer (transaction mode) |
| Configuration | Pydantic models from YAML files |
| Metrics | Prometheus exposition format |
| Containerization | Docker with parametric Dockerfile |
| Overlay Networks | Tor, I2P, Lokinet via SOCKS5 proxy |

## Who Is This For?

- **Researchers** studying Nostr network topology, relay behavior, and event propagation patterns.
- **Developers** building applications that need relay recommendations, health data, or event archives.
- **Relay operators** wanting to understand their relay's position in the network.
- **Protocol designers** testing NIP implementations against real-world data.
- **Anyone** who wants to run their own Nostr network observatory.

## Next Steps

- [Quick Start](/getting-started/quick-start/) — get BigBrotr running in minutes with Docker Compose.
- [Installation](/getting-started/installation/) — install from source for development.
- [Architecture Overview](/architecture/overview/) — understand the diamond DAG design.
