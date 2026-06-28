# App7 Requirements Prompt

This document is the only prompt for the next implementation pass. It is plain requirements text only and intentionally contains no code.

## Clean Starting Point

Start from commit e30c1cd7e6629bf5f0a748fa868cb0ba6a54b84b as the full local foundation.

Do not mix in older experiments, stash content, partial rollbacks, generated cache folders, subprojects, duplicate app folders, or abandoned design attempts.

Keep App7 clean. Remove files that are clearly generated, unused, duplicated, or unrelated to the working App7 application.

Preserve only what belongs to the real Agape Care app.

## Main Goal

Make the application feel like one polished product instead of several mixed designs.

The mobile experience must be clean, wide, easy to read, and comfortable for drivers, dispatchers, and admins.

The admin and dispatcher portals must feel similar to the driver portal while still keeping all admin and dispatcher controls.

Admins and dispatchers must be able to work as drivers when needed, while also having their own role features.

## Login And Session Reliability

Fix the normal browser login problem deeply.

The app must not get stuck forever on Loading Agape Care or Preparing your workspace.

The app must not randomly log out immediately after opening unless the user is truly signed out.

The app must handle the case where a normal browser has old stored data, old service worker state, old cached chunks, stale Firebase auth state, stale role data, corrupt driver profile data, or broken local storage.

Private browser working while normal browser fails means the app must detect and repair stale local browser state.

The recovery flow must give the user a clear path back to the Access Portal without trapping drivers or dispatchers.

The app must keep valid authentication when possible and only clear session data when it is required.

Role detection must be stable for admin, dispatcher, and driver accounts.

Driver profile syncing must not block the whole app forever.

Firestore listener failures, offline state, and slow startup must produce clear recovery behavior.

## Mobile Navigation

Use the clean rounded mobile bottom navigation style like the screenshot.

The navbar labels must not look too bold or heavy.

The mobile navbar must include Reports.

The bottom navigation must stay readable and not crowd text on small screens.

The selected item should be clear, but the inactive items should stay light and calm.

Use More for secondary tools instead of overloading the main nav.

## Driver Portal

Keep the driver portal as the design reference.

Do not remove the better Open Trip experience.

Driver trip cards must stay clear, actionable, and friendly on mobile.

Driver statuses should be visible and understandable, including en route, navigating to pickup, at pickup, in transit, navigating to dropoff, arrived, completed, cancelled, and no show.

## Admin Portal

The admin mobile page must match the driver portal style.

Admin must have driver work access plus admin controls.

Admin must see operations overview, live driver status, trip status, assignments, reports, users, vehicles, archives, settings, and operational activity.

Admin controls should be organized behind clean buttons, tabs, menus, or drawers instead of showing every filter and control open at once.

The admin portal must not feel cramped or like a desktop table forced into a phone.

## Dispatcher Portal

The dispatcher mobile page must match the driver portal style.

Dispatcher must have driver work access plus dispatcher controls.

Dispatcher must manage open trips, assigned trips, driver statuses, route flow, calls, chat, and dispatch actions.

The dispatch board must show the status of each driver and each trip clearly.

Controls should be grouped into simple actions and option buttons instead of leaving all filters open.

## Reports

Reports must be available from the mobile navbar.

Mobile reports must be readable and simple.

Desktop reports must also have a dense review table option like the reference screenshot.

The desktop reports table should support date review, search, status filter, driver filter, reviewed filter, upload, CSV export, AI action, day totals, review progress, moving time, stopped time, mark day done, reset review, row selection, and row editing.

The report table must be clean and professional, not oversized or card-heavy on desktop.

## All Pages

All pages must be mobile friendly.

Text must not overflow its container.

Controls must not overlap each other.

Important actions must be easy to reach on mobile.

Desktop pages may remain denser where useful, but mobile pages must be calm and easy to scan.

Do not add decorative clutter that makes the app harder to use.

## Design Direction

Use the current Agape Care visual language.

Keep the interface professional, calm, and operational.

Use friendly driver-portal-style mobile cards, compact headers, clear status chips, and clean grouped controls.

Avoid mixing unrelated old styles.

Avoid giant marketing layouts inside operational pages.

Avoid making every page look like a different app.

## Verification

Before committing, run the app build.

Run lint checks.

Check the local app in the browser.

Confirm the app opens to a usable Access Portal or authenticated workspace, not an endless loading screen.

Commit only after the cleaned implementation is verified.

Deploy only after the commit builds successfully.

Report the final commit number clearly.
