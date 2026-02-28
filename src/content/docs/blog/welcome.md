---
title: Welcome to BigBrotr
date: 2026-01-15
authors:
  - bigbrotr
tags:
  - announcement
excerpt: Introducing BigBrotr — a distributed relay observatory for the Nostr network built with Python and PostgreSQL.
---

BigBrotr is a distributed relay observatory for the Nostr network. It discovers relays, monitors their health, archives events, computes analytics, and exposes data through a REST API and a native Nostr DVM.

## What We Built

BigBrotr tackles the Nostr network through five pillars:

1. **Discovery** — find relays across clearnet, Tor, I2P, and Lokinet
2. **Monitoring** — 7 health checks per relay: NIP-11 info, RTT, SSL, DNS, geolocation, network/ASN, HTTP
3. **Archiving** — cursor-based event synchronization
4. **Analytics** — 11 materialized views pre-computing aggregate statistics
5. **Data Access** — REST API and NIP-90 Data Vending Machine

## Architecture

The system follows a diamond DAG dependency structure with five packages:

- **models** — pure frozen dataclasses, zero I/O
- **core** — connection pool, database facade, base service
- **nips** — NIP-11 relay information, NIP-66 health monitoring
- **utils** — DNS, keys, WebSocket transport
- **services** — eight independent services sharing a PostgreSQL database

## Eight Services

Each service runs independently and communicates through the database:

| Service | Purpose |
|---------|---------|
| Seeder | Bootstrap relay discovery from seed files |
| Finder | Discover relays from events and APIs |
| Validator | Test WebSocket connectivity |
| Monitor | NIP-11 + NIP-66 health checks |
| Synchronizer | Cursor-based event collection |
| Refresher | Materialized view refresh |
| Api | REST API with automatic schema discovery |
| Dvm | NIP-90 Data Vending Machine |

## Get Started

Check out the [Quick Start guide](/docs/getting-started/quick-start/) to run BigBrotr with Docker Compose, or read the [full technical deep dive](/blog/inside-bigbrotr/) for a comprehensive look at the architecture and design decisions.

The full source code is available on [GitHub](https://github.com/BigBrotr/bigbrotr) under the MIT license.
