---
title: "Diamond DAG: Why BigBrotr's Architecture Works"
date: 2025-03-01
authors:
  - bigbrotr
tags:
  - architecture
  - design
excerpt: A deep dive into BigBrotr's diamond DAG dependency structure and why independent services sharing a database is the right choice.
---

When designing BigBrotr, we faced a fundamental question: how do you build a system that discovers, monitors, and archives data from thousands of relays without creating a distributed systems nightmare?

## The Temptation of Microservices

The obvious approach is microservices with message queues. Seeder publishes to a queue, Finder consumes and publishes, Validator consumes and publishes, and so on. Each service would have its own database, its own deployment, and its own failure modes.

We rejected this approach for BigBrotr. Here's why:

1. **Operational complexity** — message queues add another system to monitor, tune, and debug.
2. **Ordering guarantees** — relay discovery and validation have natural ordering that's trivial in a database but complex in a message queue.
3. **Query flexibility** — analytics across the full dataset require all data in one place.
4. **Debugging** — `SELECT * FROM relay WHERE url = '...'` is easier than tracing messages through queue logs.

## The Database as Integration Point

Instead, all six services share a single PostgreSQL database. One service writes, another reads. The database handles consistency, durability, and concurrency.

This means:

- **No message loss** — data is in PostgreSQL with ACID guarantees.
- **No ordering issues** — queries read the current state.
- **No backpressure** — services run at their own pace.
- **Simple debugging** — all data is queryable with SQL.

## The Diamond DAG

The codebase itself follows a strict dependency structure:

```
              services
             /   |   \
          core  nips  utils
             \   |   /
              models
```

**Imports only flow downward.** This eliminates circular dependencies and makes the architecture self-documenting. When you look at a file's imports, you immediately know where it sits in the hierarchy.

The "diamond" shape comes from the convergence at `models` — all middle-layer packages depend on the same foundation.

## Independent Services

Each service inherits from `BaseService[ConfigT]` and implements a single `async def run()` method. They:

- Run as separate OS processes
- Have independent configuration files
- Connect to the database through PgBouncer
- Scale independently (run multiple Finders, skip the Synchronizer)
- Fail independently (Monitor crash doesn't affect Validator)

There's no orchestrator, no service mesh, no dependency injection framework. Just processes reading from and writing to a database.

## Lessons Learned

1. **Start simple** — a shared database beats a message queue for most data processing workloads.
2. **Enforce boundaries** — the diamond DAG prevents architectural erosion over time.
3. **Content-address everything** — SHA-256 deduplication eliminates an entire class of data consistency bugs.
4. **Fail fast** — frozen dataclasses with `__post_init__` validation catch errors at construction, not at use.

The full architecture documentation is in the [Architecture Overview](/docs/architecture/overview/).
