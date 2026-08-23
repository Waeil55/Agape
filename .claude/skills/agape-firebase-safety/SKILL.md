---
name: agape-firebase-safety
description: Review or change Agape Firebase, Firestore, Storage, authentication, offline cache, sync queue, imports, archives, or tenant-scoped persistence. Use whenever UI work crosses a Firebase read or write boundary.
---

# Agape Firebase Safety

Read `AGENTS.md`, then trace UI state, hooks, services, Firestore or Functions, rules, offline storage, and deployment boundaries before editing.

Preserve document IDs, Storage paths, tenant ownership, authentication, least privilege, and retry idempotency. Never clear whole collections, invent operational records, move sensitive drafts into browser storage, or report a write as successful before its authoritative result.

Treat metadata-only snapshots, offline state, partial batches, stale sessions, permission failures, and retry exhaustion explicitly. Use bounded, serialized, targeted writes. Fail closed when ownership, date scope, or source data is ambiguous.

Test changed persistence logic and authorization boundaries. Run emulator or rules checks when rules or collections change. Do not mutate production, deploy, or add credentials without explicit user authorization for that exact action.
