# Agape WellTrans Background Agent

The worker intentionally attaches to one live TripSpark `TRIPS - ASSIGNED`
schedule. It never processes a job whose service date differs from the date
shown in that schedule.

## Start a production session

Preferred:

1. Click **Download Windows Agent** once on each authorized Windows computer.
2. Extract the ZIP and run `Install-Agent.cmd`. It installs the agent in the current Windows
   profile, registers the private Agape protocol, provisions a private,
   checksum-verified Node.js LTS runtime and Chromium, and creates encrypted
   local session storage. Node.js does not need to be installed separately.
   Preferred enrollment uses an administrator-issued
   `agape-worker-wif.json` external-account configuration so Google issues
   short-lived credentials. Existing DPAPI-protected service-account
   enrollment remains a clearly reported legacy fallback during migration.
3. Choose the service date in Agape and click **Reconcile & Fill Date**.
4. If the saved WellTrans session has expired, complete the legitimate broker
   login in the opened browser. The agent detects login and TRIPS - ASSIGNED
   automatically; there is no terminal window and no Enter-key confirmation.
5. If the WellTrans portal is displaying another schedule, the agent opens the
   schedule chooser and pauses until the exact requested date is visible.
6. Use the **Agape WellTrans Console** inside the Playwright window to
   reconcile and fill the opened date, switch to an exact manual date, refresh
   the virtual-grid index, pause/resume automatic filling, or verify every
   staged field. The opened date is detected automatically.

The optional **Setup EXE** provides a graphical installer on Windows computers
whose Application Control policy permits organization utilities. Normal agent
operation remains hidden.

Manual fallback:

1. Open PowerShell in this directory.
2. Set `WELLTRANS_ENABLE_WRITES=true` for that PowerShell session.
3. Run `npm run calibrate-run`.
4. In the browser opened by the worker, sign in if required. The agent opens
   or detects `TRIPS - ASSIGNED` automatically.
5. Keep the review browser open until the operator has reviewed the staged
   records and clicked Apply.

The Agape dashboard shows `Calibrated` and the exact locked date. Queue only
trips for that date. To change dates, choose another date in Agape and click
**Reconcile & Fill Date**. The running agent receives the new date,
opens the schedule selector when possible, and remains safely paused until
the exact requested WellTrans date is visible.

## Safety guarantees

- Booking ID is the only trip matching key.
- Exactly one Pickup and one Dropoff row must be present.
- A job is rebuilt from the current Agape trip before execution.
- The driver must resolve to one unique exact TripSpark option before any
  field is edited.
- A vehicle is written only when it resolves to one unique exact TripSpark
  option. Otherwise the WellTrans vehicle cell is left unchanged.
- The signature reason is selected only by the exact visible
  `Rider Signature Received` option. Positional keyboard selection is forbidden.
- Every trip completes a read-only preflight before its first edit.
- If a later browser error occurs, all attempted fields are restored and
  verified. If rollback cannot be proven, the batch halts and requires the
  operator to click **Close**, never **Apply**.
- Every staged cell is re-located in the virtual grid and verified before the
  trip is marked ready for review.
- Before showing the green review-ready state, Agent 3.8.3 performs an exhaustive
  second pass across every staged trip. Mismatches and changed Agape source
  records are requeued and repaired automatically before review.
- The worker never clicks **Apply** or **Close**. An operator reviews every
  staged field and clicks **Apply**. When the itinerary dialog closes, Agent
  3.8.3 reads every affected portal row back, marks only persisted values
  complete, and requeues anything that was closed without being saved.
- A safe preflight failure or verified rollback does not stop later trips.
  An unverified rollback stops the batch immediately.
- Failed or older-version jobs are never requeued automatically; retry is an
  explicit operator action in Agape.
- Other service dates stay pending and cannot be written to the selected grid.
- Credentials and session state remain local and encrypted; they are not
  stored in Firestore.
- The Agent runs a read-only portal contract canary before staging any date.
  Missing or renamed WellTrans fields stop the run before a record is edited.
- Every staged, failed, requeued, and live-verified transition writes an
  append-only `welltrans_sync_events` record with the source fingerprint,
  worker instance, review session, and timestamp.
- Each Agent publishes an independent heartbeat. The selected service date is
  protected by a renewable fencing lease, so a standby computer can take over
  only after the active owner stops renewing.
- Turbo mode is enabled by default. It caches portal editor capabilities only
  after they have been proven in the current schedule, uses adaptive editor
  readiness checks, and still verifies the exact row after every write.
  Set `WELLTRANS_TURBO_MODE=false` only for portal diagnostics.

## Enterprise verification

Agent 3.8.3 adds a separate deterministic verification contract after staging.
It records field-level expected/actual evidence in `welltrans_verification_runs`.
Any supported mismatch creates an integrity-bound command in
`welltrans_correction_commands`; Playwright accepts it only when its Booking ID,
service date, source fingerprint, review-session ID, target trip, and approved
field allowlist all still match. The corrected trip is read back again before
the command becomes verified. Ambiguous rows, stale commands, altered commands,
or unsupported fields block the trip. Gemini remains explanation-only and can
never authorize or supply transportation values.

Run `npm test` to execute the deterministic TripSpark digital twin. It indexes
5,000 bookings / 10,000 Pickup and Dropoff rows, stages every exact Booking ID,
proves that staging never performs Apply, and exercises whole-trip rollback
without touching production WellTrans records.

Use `npm run standby` when writes must remain disabled. `npm run login` only
refreshes the encrypted session; it does not process queued jobs.
