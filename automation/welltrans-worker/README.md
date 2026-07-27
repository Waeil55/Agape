# Agape WellTrans Worker

The worker intentionally attaches to one live TripSpark `TRIPS - ASSIGNED`
schedule. It never processes a job whose service date differs from the date
shown in that schedule.

## Start a production session

1. Open PowerShell in this directory.
2. Set `WELLTRANS_ENABLE_WRITES=true` for that PowerShell session.
3. Run `npm run calibrate-run`.
4. In the browser opened by the worker, sign in and open the required
   `TRIPS - ASSIGNED` date so the itinerary grid is visible.
5. Press Enter in PowerShell.
6. Keep that worker browser and PowerShell window open.

The Agape dashboard will show `Calibrated` and the exact locked date. Queue
only trips for that date. To change dates, stop the worker with Ctrl+C, rerun
`npm run calibrate-run`, and select the new schedule.

## Safety guarantees

- Booking ID is the only trip matching key.
- Exactly one Pickup and one Dropoff row must be present.
- A job is rebuilt from the current Agape trip before execution.
- Driver and vehicle mappings must resolve to values accepted by TripSpark.
- The worker reopens the itinerary after Apply and compares every submitted
  field before marking a log completed.
- One trip failure does not stop later trips.
- Other service dates stay pending and cannot be written to the selected grid.
- Credentials and session state remain local and encrypted; they are not
  stored in Firestore.

Use `npm run standby` when writes must remain disabled. `npm run login` only
refreshes the encrypted session; it does not process queued jobs.
