# Agape Care Enterprise Agent Standard

These instructions apply to every task in this repository. Treat user claims
that work is "done" as context, not proof. Re-inspect the current code and
runtime state before changing or reporting anything.

## Required operating standard

1. Understand the complete workflow before editing. Trace UI, state, service,
   Firestore/Functions, security rules, automation, and deployment boundaries
   that participate in the requested behavior.
2. Fix root causes, not screenshots or isolated symptoms. Search for every
   equivalent path and shared component so the same defect is not left on
   another role, viewport, date, or page.
3. Preserve existing working behavior and user data. Never invent trips,
   records, credentials, IDs, dates, statuses, or successful outcomes.
4. Prefer deterministic validation and reconciliation over AI inference for
   operational, billing, transportation, identity, time, mileage, signature,
   and broker data.
5. Fail closed. Ambiguous, incomplete, conflicting, or unverified data must be
   blocked with a precise reason; it must never be silently skipped, guessed,
   coerced, or reported as complete.
6. Make selected scope explicit and enforce it end to end. Date-scoped work
   must use `tripCalendarDateKey()` from `src/utils/tripDate.js`; do not use
   direct date-string equality for trip filtering.
7. Build complete state handling: loading, empty, populated, partial,
   permission denied, validation failure, retry, offline, stale session, and
   success. Actions must be idempotent where retries are possible.
8. Keep role permissions least-privileged. Reuse current authentication and
   authorization. Never place secrets, service-account files, passwords,
   session material, or private keys in source control, Firestore, client
   bundles, logs, screenshots, or error messages.
9. Keep desktop and mobile behavior functionally complete. Reuse the shared
   design system and components instead of creating page-specific imitations.
10. Do not call work complete from a build alone. Verify the actual affected
    workflow with proportionate automated tests and, for UI/runtime work,
    rendered or live behavioral inspection.

## Completion evidence

For each implementation, obtain and report the relevant evidence:

- focused unit/integration tests for changed business logic;
- regression tests for the reported failure and boundary cases;
- successful production build and syntax/type/lint checks that exist;
- Firestore rules/emulator checks when authorization or collections change;
- visual checks at representative desktop and mobile sizes for UI changes;
- live status/log verification for workers, queues, deployments, and external
  integrations;
- a clean `git diff` review that excludes unrelated edits and secrets.

Never say "perfect", "fully working", "zero errors", "synced", or "deployed"
without direct evidence. State any external or human verification that remains.

## Agape UI conventions

- Default to light mode unless the user explicitly selects dark mode.
- Use the existing admin/mobile component systems and Tailwind `slate`
  palette. Do not introduce `gray-*` utility classes or unexplained hardcoded
  colors.
- Use `rounded-xl` for cards and reserve `rounded-3xl` for modals/overlays.
- Use semibold body/heading text; reserve bold weight for action buttons and
  badges.
- Mobile scroll regions behind the bottom navigation need adequate bottom
  clearance, normally `pb-24`.
- Accessibility, keyboard behavior, focus management, responsive layout,
  empty/error states, and usable touch targets are part of completion.

## Protected mobile viewport baseline

The mobile sizing and PWA presentation at commit `839030d` are an explicitly
approved baseline. Preserve them unless the user explicitly requests a new
mobile-shell design and approves it after rendered mobile verification.

- Keep the global `html`, `body`, `#root`, `.app`, and `.App` shell on the
  verified `100%` / `100vh` sizing contract. Do not add `100dvh`, global
  `min-height: 0`, or a new app-wide overflow contract to these selectors.
- Keep `public/manifest.webmanifest` in `standalone` mode with the current
  `standalone`, `minimal-ui` display override. Do not force `fullscreen`.
- Preserve the approved admin-shell and mobile-login height behavior recorded
  in `MobileViewportBaselineContract.test.js`.
- Run that contract test plus a production build for every viewport, PWA,
  overlay, scrolling, keyboard, navigation-shell, or global CSS change.
- Visually verify at least one narrow mobile viewport before deploying any such
  change. A passing build alone is not evidence that the mobile fit is intact.

## WellTrans non-negotiable safety contract

`automation/welltrans-worker/AGENT_POLICY.md` is authoritative and must be read
before any WellTrans change. In addition:

- Reconcile the selected service date against the authoritative set of all
  completed Agape trips for that exact date.
- Every expected trip must end in exactly one visible state: verified in the
  current review session, pending, processing, failed, or blocked with a
  specific reason. Missing/unaccounted trips are a batch failure.
- Match by exact Booking ID. Only an audited, date-scoped
  `supervised_unique_composite` alias may override it. Passenger-name-only
  matching is forbidden.
- Re-read source data immediately before entry and compare its fingerprint.
- Require and verify the exact pickup/dropoff rows and every required field.
  Never infer absent times, odometers, driver, vehicle, or signature evidence.
- Vehicle is optional and is entered only when one unique normalized exact
  WellTrans option matches; otherwise it remains unchanged.
- A staged result belongs to one live browser review session. Closing or
  losing that browser invalidates all unconfirmed staged results; rebuild them.
- The automation must never click WellTrans **Apply** or **Close**. The human
  reviews the complete date and clicks Apply.
- `review_ready` requires 100% current-session coverage with zero missing,
  pending, processing, failed, blocked, stale, or unverified trips.
- AI may explain and diagnose. AI must not create, guess, approve, or directly
  submit broker transportation records.

Absolute 0% error cannot be promised for an external portal. The engineering
target is zero silent omissions and zero unverified submissions: uncertainty
must stop the affected trip or batch visibly.

## Git and deployment

- Preserve unrelated user changes and never discard work with destructive Git
  commands.
- The working branch is normally `restore-agape5`; publish with
  `git push origin HEAD:agape5` when the user requests a commit/push.
- Deploy only Firebase Hosting target `agape5` unless the task explicitly
  requires changed Functions, Firestore rules/indexes, or Storage rules.
- Build and test before deployment, deploy only the changed surfaces, inspect
  the deployed result, then confirm the exact commit and target.
- Never commit `.env` files, downloaded service-account JSON, encrypted
  session files, runtime credentials, screenshots containing sensitive data,
  or generated local runtime state.
