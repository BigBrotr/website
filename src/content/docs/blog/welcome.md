---
title: Welcome to BigBrotr
date: 2025-01-15
authors:
  - bigbrotr
tags:
  - announcement
excerpt: Introducing BigBrotr — a modular Nostr data archiving and monitoring system built with Python and PostgreSQL.
---

BigBrotr is a modular infrastructure for Nostr relay discovery, health monitoring, and event archiving. This post introduces the project, its architecture, and how you can get started.

## What We Built

BigBrotr answers three questions about the Nostr network:

1. **What relays exist?** — across clearnet, Tor, I2P, and Lokinet
2. **How healthy are they?** — RTT, SSL, DNS, NIP-11, NIP-66 health tests
3. **What events are they publishing?** — cursor-based event synchronization

## Architecture

The system follows a diamond DAG dependency structure with five packages:

- **models** — pure frozen dataclasses, zero I/O
- **core** — connection pool, database facade, base service
- **nips** — NIP-11 relay information, NIP-66 health monitoring
- **utils** — DNS, keys, WebSocket transport
- **services** — six independent services sharing a PostgreSQL database

## Six Services

Each service runs independently and communicates through the database:

| Service | Purpose |
|---------|---------|
| Seeder | Bootstrap relay discovery from seed files |
| Finder | Discover relays from NIP-65 events and APIs |
| Validator | Test WebSocket connectivity |
| Monitor | NIP-11 + NIP-66 health checks |
| Refresher | Materialized view refresh |
| Synchronizer | Cursor-based event collection |

## Get Started

Check out the [Quick Start guide](/getting-started/quick-start/) to run BigBrotr with Docker Compose, or explore the [Architecture Overview](/architecture/overview/) to understand the design.

The full source code is available on [GitHub](https://github.com/BigBrotr/bigbrotr) under the MIT license.
