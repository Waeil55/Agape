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
   The Firebase enrollment credential is protected with Windows DPAPI and can
   only be decrypted by the enrolled Windows user.
3. Choose the service date in Agape and click **Start & Fill Selected Date**.
4. If the saved WellTrans session has expired, complete the legitimate broker
   login in the opened browser. The agent detects login and TRIPS - ASSIGNED
   automatically; there is no terminal window and no Enter-key confirmation.
5. If the WellTrans portal is displaying another schedule, the agent opens the
   schedule chooser and pauses until the exact requested date is visible.

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

The Agape dashboard will show `Calibrated` and the exact locked date. Queue
only trips for that date. To change dates, stop the worker with Ctrl+C, rerun
`npm run calibrate-run`, and select the new schedule.

## Safety guarantees

- Booking ID is the only trip matching key.
- Exactly one Pickup and one Dropoff row must be present.
- A job is rebuilt from the current Agape trip before execution.
- Driver and vehicle mappings must resolve to values accepted by TripSpark.
- Every staged cell is re-located in the virtual grid and verified before the
  trip is marked ready for review.
- The worker never clicks **Apply** or **Close**. An operator reviews every
  staged field, clicks **Apply**, and confirms the applied record in Agape.
- One trip failure does not stop later trips.
- Other service dates stay pending and cannot be written to the selected grid.
- Credentials and session state remain local and encrypted; they are not
  stored in Firestore.

Use `npm run standby` when writes must remain disabled. `npm run login` only
refreshes the encrypted session; it does not process queued jobs.
