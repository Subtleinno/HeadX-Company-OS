# company-os

**The operating system for an AI-native company.**

This repository holds the *engine*: the policy gateway, the approval inbox, the
audit log, the risk classification and the Super Agent that keeps them growing.
It is **private**, and it is the source of truth for what we are building and why.

> **Status: P0 — building the foundations.** No production code yet.

---

## For people new to this repo

Start here, in this order:

1. [`docs/company-os-master-plan.md`](docs/company-os-master-plan.md) — the master
   plan: goals, the eight non-negotiable principles, the L0–L4 risk scale, the
   target architecture, the phase plan (P0–P7), and **Appendix A: architecture
   decisions** (why each major choice was made).
2. [`docs/p0-bootstrap-v2-for-dsh.md`](docs/p0-bootstrap-v2-for-dsh.md) — the
   P0 task brief: who does what, and the rules the agent must follow.
3. Appendix B of the master plan — the progress log.

## What this system is

```
Company OS (engine)
├── Audit log          append-only, hash-chained
├── Risk classification L0–L4, stored as data, not code
├── Policy gateway      every write to an external system passes through it
├── Approval inbox      where the founder spends the daily approval time
├── Kill switch         one action pauses all agent writes
└── Super Agent         development line + production line
```

The engine **connects to** business systems; it does not absorb them:

| System | Role | Phase |
|---|---|---|
| HxDesign | Branding, knowledge base, design work | P2 |
| AI-native ERP | Orders, inventory, purchasing, logistics | P4 |
| ERPNext | Accounting ledger only | P5 |
| WordPress | Content website | P6 |
| PIM | Deferred — no product catalogue yet | TBD |

## The goal

The founder runs several companies under one legal entity with several brands,
and spends roughly **two hours a day** in an approval inbox. Everything here
exists to make that possible without losing control.

Non-negotiables (full list in the master plan, section 2): responsibility stays
with a human, risk is graded per *action* not per *agent*, unapproved requests
expire rather than execute, least privilege per agent and per brand, and the
audit log is immutable.

## Ground rules for this repository

1. **No secrets, ever.** No API keys, tokens, passwords or customer personal
   data in commits, issues, PRs or logs. Strategy and planning documents are
   allowed here because the repository is private.
2. **No secrets in history.** Treat every commit as if it could be published
   one day; never rely on the repository staying private.
3. **Every PR states purpose, risk level, tests, impact and rollback.** Most of
   them will be written by an agent.
4. **`main` is the source of truth.** Changes arrive through pull requests.

## Structure

| Path | Purpose |
|---|---|
| `docs/` | Master plan, task briefs, architecture decisions, progress log |
| `.gitignore` | Keeps secrets, keys and build output out of git |

## Current progress

| Date | Event |
|---|---|
| 2026-11-03 | P0 Step A complete: repository, tooling (Node 22, pnpm 12, gh 2.103), docs |
| next | P0 Step 1: environment check and reading the DSH safety documentation |
