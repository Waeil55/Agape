# Agape WellTrans Accuracy Policy

The worker is a deterministic, fail-closed broker staging agent. It does not
guess, improvise data, or use passenger names as a primary match.

For every requested service date it must:

1. Process only the exact WellTrans schedule matching the requested date.
2. Reconcile against the authoritative set of completed Agape trips.
3. Match by exact Booking ID, unless an administrator has created an audited,
   date-scoped `supervised_unique_composite` booking alias.
4. Re-read the current source trip immediately before staging and record a
   fingerprint of the fields used.
5. Require one Pickup row and one Dropoff row.
6. Preflight every required editor before the first mutation.
7. Verify every staged value after entry and verify the complete trip again.
8. Roll back the whole trip after any field failure; stop the batch when a
   rollback cannot be proven.
9. Leave Vehicle unchanged unless the portal offers one unique normalized
   exact match.
10. Never click Apply or Close. A human reviews and applies the complete date.
11. Never report `review_ready` while a completed trip is missing, invalid,
    pending, processing, failed, blocked, or unverified.
12. Bind every staged trip to the current browser review-session ID. If that
    browser closes before confirmation, rebuild every stale staged trip in the
    next browser; never reuse an old `awaiting_review` result.
13. Independently scan the authoritative Agape trip collection for the exact
    selected date. Automatically queue newly completed trips and exclude
    cancelled trips even when legacy cancellation records contain completedAt.
14. Re-audit every previously completed log against the live WellTrans cells
    in the current browser session. Missing or changed portal values must be
    requeued; a completed database status alone is never proof.
15. Repeat authoritative discovery and live completed-trip verification while
    the review browser remains open. Never require the operator to notice or
    report a missing completed trip.

AI may explain failures and propose diagnostics. AI must never invent broker
records, infer medical-trip values, bypass validation, or directly enter data.
