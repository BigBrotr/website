---
title: Streaming Events from Nostr Relays
date: 2026-03-13
authors:
  - bigbrotr
tags:
  - tutorial
  - nostr
  - streaming
description: Dumping every event from a Nostr relay should be simple — pick your filters, set a time window, iterate. With BigBrotr's stream_events, it is.
excerpt: Dumping every event from a Nostr relay should be simple — pick your filters, set a time window, iterate. With BigBrotr's stream_events, it is.
---

Getting *all* events from a Nostr relay for a given time window sounds like it should be simple. Pick a `since`, pick an `until`, send a `REQ`, done. In practice, it's anything but.

Relays cap how many events they return per request. Some enforce a hard `LIMIT` lower than what you ask for — silently. You get back 100 events with no indication of whether that's everything or just a truncated slice. Multiple events can share the same `created_at` timestamp, so paginating by "last timestamp seen" risks skipping or duplicating events. And if you want results in chronological order, good luck — relays don't guarantee any sort.

Building a correct, complete, ordered dump from a relay means writing retry logic, deduplication, signature checks, boundary probing, and adaptive windowing. It's a lot of code for something that should be straightforward.

## `stream_events`: Zero Stress

BigBrotr's `stream_events` reduces all of that to an async `for` loop:

```python
import asyncio
import time

from nostr_sdk import Client, Filter, RelayUrl
from bigbrotr.utils.streaming import stream_events

RELAY = "wss://relay.damus.io"
FILTERS = [Filter()]
SINCE = 0
UNTIL = int(time.time())
LIMIT = 500
TIMEOUT_SECS = 10.0


async def main() -> None:
    client = Client()
    await client.add_relay(RelayUrl.parse(RELAY))
    await client.connect()

    async for event in stream_events(
        client=client,
        filters=FILTERS,
        start_time=SINCE,
        end_time=UNTIL,
        limit=LIMIT,
        request_timeout=TIMEOUT_SECS,
    ):
        print(
            f"{event.created_at().as_secs():>12}  "
            f"{event.kind().as_u16():>5}  "
            f"{event.id().to_hex()}  "
            f"{event.author().to_hex()}"
        )

    await client.disconnect()


asyncio.run(main())
```

That's it. Every event matching your filters, for any time window, from any relay, yielded in ascending `(created_at, event_id)` order. No missing events, no duplicates, no manual pagination. The full example is in [examples/stream_events.py](https://github.com/BigBrotr/examples/blob/main/stream_events.py).

You choose the filters — all events, specific kinds, specific authors, tag queries, whatever Nostr filters support. You choose the time window — the last hour, the last year, or the entire relay history since epoch. `stream_events` handles the rest.

## Resumable by Design

If the stream gets interrupted — network error, timeout, you hit Ctrl+C — just restart from the `created_at` of the last event you received. Since events are yielded in strict chronological order, there's no ambiguity about where you left off. No checkpoint files, no cursor management, no state to persist. The function is stateless — your resume point is just the last timestamp you saw.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `RELAY` | The relay URL to connect to |
| `FILTERS` | Nostr filters — `[Filter()]` matches all events |
| `SINCE` / `UNTIL` | Inclusive time window boundaries (Unix timestamps) |
| `LIMIT` | Page size per `REQ` — controls the split threshold, not the total output |
| `TIMEOUT_SECS` | How long to wait for each relay response |

`LIMIT` controls the page size per individual `REQ` to the relay, not the total number of events returned. The function will issue as many requests as needed to cover the entire window — you don't set a cap on the output.

---

## How It Works Under the Hood

The simplicity on the surface hides a careful algorithm underneath.

### Data-Driven Windowing with Binary-Split Fallback

The function maintains a stack of upper bounds and a moving lower bound, processing windows left-to-right in a depth-first traversal. For each window `[current_since, current_until]`:

1. **Fetch** — requests events with a three-layer validation pipeline: filter matching, cryptographic signature verification, and deduplication by event ID. Events are consumed via streaming (not bulk fetch) to prevent relay flooding.

2. **Verify completeness** — if the fetch hits the limit, the function doesn't immediately split. Instead, it runs a data-driven verification:
   - Fetches all events at the minimum `created_at` timestamp from the original batch
   - Checks that the boundary fetch is consistent (max timestamp equals the expected boundary)
   - Probes for events *before* that minimum timestamp — if any exist, the window was incomplete
   - If all checks pass, the combined result is complete — no split needed

3. **Binary split** — only when verification fails (inconsistent boundary, or earlier events detected), the window is split at `mid = current_since + (current_until - current_since) // 2`. The left half is pushed to the front of the stack for depth-first processing.

4. **Bottom out** — when `current_since == current_until` (a single-second window), no further splitting is possible. All events in that second are yielded regardless of count.

This means most windows resolve without splitting — the binary split only kicks in when the relay genuinely has more events than the page size allows. The algorithm converges in O(log N) splits in the worst case, with each split halving the time window.

Events are always yielded in ascending `(created_at, event_id)` order, regardless of how many splits were needed.

### Validation Pipeline

Every event passes through three layers before being yielded:

1. **Filter matching** — `Filter.match_event()` verifies the event matches the requested kinds, authors, tags, and time range. This catches relays that return out-of-scope events.
2. **Signature verification** — `Event.verify()` checks the cryptographic signature. Invalid signatures are silently skipped.
3. **Deduplication** — events are tracked by ID across all filters, so the same event seen through different filter paths is only yielded once.

Events that fail domain conversion (null bytes in content/tags, timestamp overflow) are silently dropped with a debug log — the stream continues without interruption.

---

## Running It

```bash
cd examples
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python stream_events.py
```

```
  created_at   kind  id                                                                pubkey
-----------------------------------------------------------------------------------------------
  1672531200       1  a1b2c3d4e5f6...                                                  e5f6a7b8c9d0...
  1672531201       0  c9d0e1f2a3b4...                                                  a3b4c5d6e7f8...
```

## Use Cases

Complete event dumps open up a lot of possibilities: building search indexes, computing analytics, migrating data between relays, auditing what a relay has seen, or simply archiving everything for offline analysis. BigBrotr's Synchronizer service uses the same `stream_events` function internally for its cursor-based archiving pipeline — if it's reliable enough for production ingestion at scale, it'll work for your scripts too.
