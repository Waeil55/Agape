# WellTrans Sync Automation

## Architecture

Agape’s web application is the control plane. Administrators configure the portal URL, review completed-trip readiness, queue work, monitor status, retry failures, and inspect explanations.

The verified WellTrans provider portal linked by WellTrans is `https://tripspark.welltransnemt.com/`.

`queueWellTransSync` is the trusted server-side boundary. It re-reads trips from Firestore, validates completion and required fields, builds the minimum broker payload, rejects active/completed duplicates, and creates pending records in `welltrans_sync_logs`.

The Playwright worker in `automation/welltrans-worker` is the data plane. It runs on an Agape-controlled Windows workstation or server authorized to access WellTrans. It claims one job transactionally, matches the exact Booking ID, locates one Pickup and one Dropoff activity row, updates fields, verifies success, and records the result. A failed trip does not stop later trips.

## Security

- Never put a WellTrans username, password, cookie, token, or Playwright storage state in Firestore, source control, Firebase Hosting, or a committed `.env`.
- Use a dedicated least-privilege Google service account for the worker. Store its JSON file outside the repository.
- Manual login produces AES-256-GCM encrypted Playwright state. Keep the encryption key and encrypted state outside the repository with OS permissions restricted to the worker account.
- Screenshots may contain protected information. They remain in the private Firebase Storage bucket and logs store an object path only.
- Only Firebase administrators can queue jobs or read settings and logs. Browser clients cannot create or modify sync results.
- Obtain written authorization for automated WellTrans access before enabling production processing.

## Worker installation

1. Install Node.js 22.
2. Open `automation/welltrans-worker`.
3. Run `npm install`.
4. Run `npm run install-browser`.
5. Configure the variables from `.env.example` in the worker service manager. Do not create a repository `.env`.
6. Generate a key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
7. Run `npm run login`, complete login manually, and press Enter in the terminal.
8. Validate selectors with a designated test booking using `npm run once`.
9. Run `npm start` under a restricted Windows service account with automatic restart.

## Portal selectors

WellTrans portal markup is not available in this repository and may change. Defaults use accessible labels and visible text. Override only necessary selectors with `WELLTRANS_SELECTORS_JSON`. The worker requires exactly one Pickup and one Dropoff row for the exact Booking ID; ambiguous matches fail safely.

`WELLTRANS_ALLOWED_HOSTS` is mandatory production defense-in-depth. It prevents an administrator-edited Firestore URL from redirecting the privileged worker to an unapproved host.

```json
{
  "bookingSearch": "#bookingSearch",
  "searchButton": "button[data-action='search']",
  "driver": "select[data-column='driver']",
  "vehicle": "select[data-column='vehicle']",
  "arrival": "input[data-column='arrival']",
  "departure": "input[data-column='departure']",
  "mileage": "input[data-column='mileage']",
  "signature": "select[data-column='signature']",
  "save": "button:has-text('Apply')",
  "success": "text=Changes saved"
}
```

## Agape field mapping

- Booking ID: `bookingId`, then `tripId`, `tripNumber`, then document ID.
- Pickup arrival: `pickupArrival`, `arrivalTime`, or `arrivedPickupTime`.
- Pickup departure: `pickupDeparture`, `departedPickupTime`, or `departureTime`.
- Dropoff arrival: `dropoffArrival`, `arrivalDropoffTime`, or `completedAt`.
- Dropoff departure: `dropoffDeparture`, `departedDropoffTime`, or `completedAt`.
- Mileage: `dropoffOdometer - pickupOdometer`, with controlled fallback to recorded distance.
- Signature: true when a captured signature reference or paper-signature confirmation exists.

Passenger name is display-only in Agape and is never used for broker matching.

## Production checklist

- Confirm WellTrans automation authorization.
- Test every selector against the production portal using a designated test record.
- Confirm whether WellTrans expects trip mileage, cumulative odometer, or row-specific mileage.
- Confirm driver and vehicle option values match WellTrans exactly.
- Configure screenshot retention and incident access.
- Run a supervised pilot and reconcile every result before increasing batch size.
- Monitor sync logs, worker health, Firebase Functions errors, and audit logs.
