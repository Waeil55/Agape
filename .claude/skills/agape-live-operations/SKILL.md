---
name: agape-live-operations
description: Build or review Agape dispatch, maps, driver tracking, chat, time tracking, payroll, route planning, task control, and operational status workflows.
---

# Agape Live Operations

Read `AGENTS.md` and `DESIGN.md`. Trace the selected role, service date, authoritative record, live state, offline state, and final mutation for the complete workflow.

Use `tripCalendarDateKey()` for service-date scope. Never infer a driver, location, trip, time, mileage, vehicle, signature, identity, or completion. Ambiguous or stale data must remain visibly blocked or pending.

Maps must retain a text equivalent for provider failure, stale GPS, permissions, selected driver, destination, and last update. Chat drafts and sensitive route plans stay in current-session memory. Time, payroll, and task views show ownership, scope, source state, and the next safe action.

Optimize live lists and maps with stable identities, indexed lookups, memoized selectors, coalesced updates, bounded history, and progressive disclosure. Verify retry, reconnect, identity change, date boundary, mobile, desktop, and keyboard behavior without writing to production.
