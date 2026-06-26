# App7 Cleanup And Issue Log

Date: 2026-06-26
Base commit checked: `414e6bd`
Branch checked: `agape5`

## Cleanup Completed

- Removed orphan gitlink/submodule placeholders: `VIP4`, `VIP55`.
- Removed scratch/workbench code: `scratch/newReportsPage.jsx`, `scratch/update_ui.js`.
- Removed old one-off analysis files: `analyze.mjs`, `find_state.js`, `test_DriverPage.jsx`.
- Removed stale public artifacts: root `agape.png`, `public/index.html` with old OpenCode QR content, and unused `public/agape.svg`.
- Removed generated/local files from the working tree: `.firebase/`, `android/.gradle/`, `android/build/`, `android/app/build/`, `android/local.properties`, `dist/`.
- Removed unreachable source modules found by import graph analysis.
- Updated `.gitignore` and `.eslintignore` so generated caches, build output, native copied web bundles, scratch files, and dependency folders do not pollute future checks.
- Removed the dead `export-firestore` package script because it pointed to missing `tools/export_firestore.js`.
- Added `.env.example` with placeholders only.

Post-cleanup import graph result: `65` source files, `65` reachable, `0` unreachable source files.

## Login And Boot Fixes Completed

- Fixed the regular-browser/private-browser root cause where app version changes deleted IndexedDB and could wipe Firebase Auth persistence.
- Version upgrades now clear only stale Agape static caches and preserve Firebase Auth storage.
- Added explicit `browserLocalPersistence` before sign-in and account creation.
- Removed forced 6-second and 15-second timers that could show the login portal while Firebase was still restoring a real session.
- Cached role boot now works when the cached role matches the selected portal, so Firestore/profile delays do not trap users on the loading screen.
- Cached role correction now updates the active session in place instead of reloading the whole app.
- Recovery UI now uses `Repair Browser & Reload`, which repairs app caches/service-worker state without signing out.
- The offline banner is hidden on the public access portal and only becomes visible during authenticated sessions.

## Code Quality Fixes Completed

- Fixed `functions/cleanup-corrupted.js` inner function declaration.
- Fixed duplicate `archives` and `routePlanner` switch cases in `src/components/EnterpriseDashboard.jsx`.
- Fixed missing `ArrowUp` and `ArrowDown` imports in `src/components/OperationsCommandCenter.jsx`.
- Fixed regex escape lint error in `src/hooks/useFirestoreAppData.js`.
- Removed mixed static/dynamic import build warnings for maps, Firestore schema, and event engine.
- Lazy-loaded `DriverPage` and `EnterpriseDashboard`.
- First app JS chunk dropped from about `804 kB` minified to about `178 kB` minified.

## Admin And Dispatcher Portal Fixes Completed

- Upgraded the dispatch board card UI to match the cleaner driver-portal style while keeping live trip data, assignment, route, contact, edit, archive, and exception actions.
- Added visible Board/Cards/Ledger view switching in the dispatch control bar.
- Fixed the Driver sort control so it uses the real assignment sort key.
- Added dispatcher/admin driver-work controls directly on dispatch cards: Start, Pickup, Transport, Dropoff, and Complete.
- Added audit logging and protected confirmation hooks for terminal driver-work and exception actions.
- Added a Driver Workstation tab for admins and dispatchers. Admins can operate all drivers; dispatchers operate their scoped drivers.
- Updated the driver portal identity matching so selected driver profiles work by driver ID as well as email.

## Mobile Responsiveness Fixes Completed

- Reworked the live map command center so the command sidebar stacks above the map on phone widths instead of forcing a fixed desktop panel.
- Made the live map HUD wrap safely on small screens and adjusted map overlays, Street View, and driver detail modal grids for mobile.
- Added mobile card layouts for Drivers, Vehicles, User Management, Driver Assignments, System Activity Feed, and Archives while preserving desktop tables.
- Adjusted Reports, Settings, and Route Planner layouts so filters, tabs, schedule panels, and detail rows do not force horizontal overflow on mobile.
- Scoped dispatcher Settings mobile navigation to dispatcher-allowed tabs instead of showing admin-only tabs on small screens.

## Native And PWA Fixes Completed

- Added root `capacitor.config.json` as the source of truth for native sync.
- Added `npm run cap:sync` to build and sync native assets consistently.
- Updated the service worker to `agape-v12`.
- Service worker activation now deletes only Agape/workbox caches, not every cache on the origin.

## Current Verification

- `npx eslint . --ext .js,.jsx --quiet` passes.
- `npm run build` passes with no warnings.
- Local browser reload at `http://127.0.0.1:5173/` shows the Access Portal with no console errors.
- The offline banner DOM is still mounted, but hidden on the public portal (`offline-banner`, opacity `0`).
- Phone viewport smoke test at `390 x 844` shows no horizontal overflow and no console errors on the Access Portal.
- I did not submit login credentials during browser testing.

## Why Regular Browser Failed While Private Browser Worked

- Regular browsers keep old service workers, old caches, localStorage, and IndexedDB; private windows usually start clean.
- The old app deleted all IndexedDB databases on app version change. Firebase Auth stores persistent login data in browser storage, so that could erase the saved session and look like instant logout.
- The old app also forced the login screen after short loading timers, even if Firebase was still restoring auth from storage.
- Stale chunks/service-worker state could trigger reload loops or old code paths in the regular browser.
- Cached role/profile checks were too dependent on immediate Firestore server reads during login.

The repair pass addresses all of those app-side causes.

## Remaining Follow-Ups

1. `.env`, `.env.development`, and `.env.production` are still tracked in git. `.env.example` now exists, but the real env files should be untracked without deleting the local files, and any exposed secrets should be rotated.

2. Many Firebase maintenance scripts under `functions/` read `C:/Users/waeil/.config/configstore/firebase-tools.json` and post OAuth refresh-token data manually. This is not an app login blocker, but it is not production-grade operations hygiene. Replace those scripts with Firebase Admin SDK/service-account auth or a shared CLI-auth helper before using them from another machine or CI.

3. The dispatch board and driver-work access have been upgraded. The next optional product pass should focus on deeper Admin page information architecture, not the dispatch-board blocker.
