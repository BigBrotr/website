---
title: "Dead Keys: The Unsolved Problem of Marking Compromised Nostr Identities"
date: 2026-03-20
authors:
  - bigbrotr
tags:
  - protocol
  - nostr
  - security
  - nip
description: We found 38 Nostr accounts actively using a leaked private key. Now everyone is asking the same question — once a key is out, how do you warn the network permanently? We examined every existing mechanism in the protocol, and none of them work.
excerpt: We found 38 Nostr accounts actively using a leaked private key. Now everyone is asking the same question — once a key is out, how do you warn the network permanently? We examined every existing mechanism in the protocol, and none of them work.
---

Our previous post — *[Uncovering Exposed Private Keys Across the Nostr Network](/blog/exposed-nsec-analysis/)* — generated more discussion than we expected. The data got attention, but the question that kept coming up wasn't about the numbers. It was about what comes next.

**Once a key is publicly known, how do you mark it as dead?**

This turns out to be a harder problem than it looks. We went through every mechanism currently available in the protocol. None of them fully solve it. Here is why — and what could actually work.

A note before we start: this article is about *remediation* — what to do after a key has already leaked. Prevention is a separate problem, and one with a good existing answer. NIP-46 (Nostr Connect) allows users to delegate signing to a remote bunker without ever exposing the raw `nsec` to a client. If you are reading this and your key has not been compromised, NIP-46 is the thing to adopt. But for the 38 accounts in our dataset, prevention has already failed. The question is what happens now.

---

## The Constraint Nobody Can Work Around

Before examining specific solutions, there is one principle that rules out most approaches immediately.

**Any event signed by key A can be replaced or repudiated by key A.**

This is not a flaw. It is intentional. Your key is your identity and you have sovereign control over your own event stream. The moment an attacker holds your `nsec`, they inherit that sovereignty. They can publish, delete, and replace anything in your name with equal authority.

Any warning broadcast using the compromised key can be overwritten with the same key. A `kind:0` profile update announcing compromise can be replaced by a newer `kind:0` without the flag. A warning note can be targeted by a `kind:5` deletion request. It does not matter that NIP-09 says relays *SHOULD* honor deletions rather than *MUST* — even if some relays ignore the deletion, the attacker can always publish a newer replaceable event that supersedes the warning. The result is a network where some clients see the warning and others do not. You cannot build a trust mechanism on a signal that is visible to some users sometimes.

> The tombstone cannot live in the event stream of the compromised key.

Everything else follows from this.

---

## Why Every Obvious Solution Fails

### Self-reporting with the leaked key

The intuitive first move: publish a note or update your profile announcing the key is compromised. But in the cases that matter most — like the keys in our dataset, published in plaintext on Nostr — the attacker typically has the `nsec` before the owner even knows it leaked. There is no race condition to win. The attacker is already watching.

Even in the best case, where the owner discovers the leak first and broadcasts a warning to hundreds of relays simultaneously, the attacker can overwrite the `kind:0` profile with a clean version moments later. The warning becomes inconsistent across the network — present on some relays, gone on others. A security mechanism that depends on who queries which relay first is not a mechanism. It is a bet.

### Kind 5 against kind 5

NIP-09 is explicit: publishing a deletion request against another deletion request has no effect. You cannot make an event undeletable by chaining deletion mechanics. The model does not support it.

### A compromise tag on kind 0

`kind:0` is a replaceable event. Clients always adopt the most recent version. An attacker publishes a new `kind:0` without the compromise tag — it becomes the canonical profile. The flag is gone.

### NIP-56 Reporting (kind 1984)

A `kind:1984` report is an external declaration from a third party. It carries a report type — including `impersonation` — but no proof that the reporter actually holds the private key. Anyone can report anyone. It is a claim, not a demonstration. The signal-to-noise ratio makes it useless as a trust mechanism for this specific use case.

### NIP-32 Labeling (kind 1985)

More flexible than NIP-56, but the same fundamental weakness: arbitrary labels from arbitrary keys with no embedded proof of `nsec` possession. A `compromised` label means nothing if anyone can attach it to anyone.

### NIP-58 Badges (kind 8)

Badge awards are non-transferable by spec — which sounds promising. But the fundamental problem is the same as NIP-56 and NIP-32: anyone can define a `compromised` badge and award it to any account without proving they hold the private key. It is still just a claim. The issuer can also delete their own `kind:8` with a `kind:5` at any time, so the award is not even reliably persistent. No proof of key possession, no guarantee of permanence — NIP-58 does not help here.

### NIP-62 Request to Vanish (kind 62)

This NIP actually worsens the threat model. An attacker holding the `nsec` can issue a `kind:62` requesting all relays to permanently delete every event from that pubkey — including received DMs. The entire account history is erased before the victim knows anything happened.

---

## What the Solutions Have in Common

Every failed approach shares one of two flaws:

1. **The warning lives on the compromised key's event stream** — repudiable by the attacker.
2. **The warning is a claim with no cryptographic proof** — gameable by anyone.

A real solution requires both properties simultaneously: signed by an external key (so the attacker cannot touch it) *and* containing proof of `nsec` possession (so it cannot be faked).

---

## What Could Actually Work

### NIP-85 (kind 30382) + embedded `proof` tag

NIP-85 defines Trusted Assertions — addressable events published by external service keys that attest facts about other pubkeys. The infrastructure is already there. What is missing is a mechanism to attach a cryptographic proof of key possession.

The proposal is a minimal extension to `kind:30382`:

```json
{
  "kind": 30382,
  "pubkey": "<discoverer key B>",
  "tags": [
    ["d", "<compromised pubkey A>"],
    ["rank", "0"],
    ["compromised", "true"],
    ["proof", "<sig of key A over canonical message>"]
  ],
  "content": ""
}
```

The `proof` tag contains a valid Schnorr signature produced with the leaked key over a canonical message defined independently of the attestation event itself — for example, the fixed string `"compromised:<pubkey A>"`. Using the event's own `id` would create a circular dependency: the `id` is a hash of the full serialized event including the `proof` tag, so it cannot exist before the signature, and the signature cannot be produced without it. A pre-defined canonical message breaks the cycle and keeps verification straightforward. Anyone who encounters this event can perform two independent verifications:

1. The outer event signature is valid → key B authored this.
2. The `proof` field is a valid signature of key A → whoever wrote this possessed the `nsec`.

The attacker controls key A but not key B. They cannot delete or modify this event. Clients that implement NIP-85 can zero out the WoT score and display a permanent warning banner on the profile — regardless of what the compromised key subsequently publishes or deletes.

### Why false flags are not a real risk

A reasonable concern: what stops a malicious actor from falsely flagging an account as compromised?

The `proof` tag makes this impossible. To produce a valid `proof`, you must hold the `nsec` of the target key. If you have the `nsec`, the account *is* compromised — by definition, regardless of how you obtained it. In Nostr, your key is your identity. Not your keys, not your account. If a custodial service or a signer app holds the `nsec`, the account was never fully sovereign to begin with — and reporting it is the least harmful thing anyone could do with that key.

Key B is also permanently linked to the attestation. A false flag would be a public, on-chain declaration that you hold someone's private key. The reputational cost is significant. The incentive structure self-selects for honest reporting.

### The discovery problem

For this mechanism to work, clients need a way to find compromise attestations. When loading a profile, a client must answer: "does a verified compromise attestation exist for this pubkey?"

NIP-85 events are addressable by their `d` tag, which in this proposal is the compromised pubkey. A client can query any relay for `kind:30382` events with a matching `d` tag. But *which* relays? And *whose* attestations should it trust?

The practical path is the same one NIP-85 already assumes: clients maintain a list of trusted attestation services — similar to how browsers ship with a list of trusted certificate authorities. A client might trust attestations from BigBrotr, from a well-known WoT scoring service, or from keys in the user's own follow graph. These services earn trust over time through consistent, verifiable reporting. The trust model is explicit, not implicit.

This is a centralization pressure point. A future extension could define a relay-level index — a dedicated `kind` that aggregates verified compromise attestations across multiple attestors — but that is beyond the scope of this proposal. For now, the CA-like model is the realistic starting point, and the `proof` tag ensures that even a centralized attestor cannot fabricate compromise claims — they still need the `nsec`.

---

## What Needs to Happen Next

This is a proposal, not a standard. For it to become useful, three things need to happen.

**Protocol.** The `proof` tag and `compromised` field need to be formally specified — either as an extension to NIP-85 or as a new NIP — with a defined canonical message format for the embedded signature.

**Clients.** At least two clients need to implement verification and rendering of the warning banner for the proposal to meet NIP acceptance criteria. Until a client implements this check, its users remain exposed to compromised keys with no warning. Implementing this is not optional overhead — it is a duty of care toward the people who use the client.

**Relays.** Relays should index `kind:30382` events by their `d` tag (already required by NIP-85) so that clients can efficiently query "does a verified compromise attestation exist for pubkey X?" at profile load time.

The 38 accounts in our dataset — and the dozens more that will surface as relay archives grow — deserve a protocol that can tell their followers the truth. Right now, there is no way to do that.

There should be.
