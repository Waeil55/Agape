# Archived Firestore Scripts

These are **local maintenance scripts** that directly read/modify/delete Firestore data
using your local Firebase CLI credentials. They were created during troubleshooting sessions.

**DO NOT run these without understanding the impact.** They hit the LIVE production database.

## Safety Levels

- **RED** (no dry-run): `cleanup-appdata.js`, `deep-clean-appdata.js`, `remove-corrupted-trips.js`, `sync-appdata-to-root.js`
- **ORANGE** (has `--dry-run`): `cleanup-corrupted.js`, `cleanup-duplicates.js`, `dedupe-*.js`, `deep-dedup.js`, `restore-trips-from-backup.js`
- **GREEN** (safe by default / read-only): `fix-today-dates.js` (uses `--fix` flag), `audit-*.js`, `check-*.js`, `find-*.js`, `measure-*.js`, `summarize-*.js`

## How to run (if needed)

```bash
node functions/scripts/archive/audit-root-trips.js
```

These are not part of the deployed application. They exist only for reference.
