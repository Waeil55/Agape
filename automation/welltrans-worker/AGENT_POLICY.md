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

AI may explain failures and propose diagnostics. AI must never invent broker
records, infer medical-trip values, bypass validation, or directly enter data.
