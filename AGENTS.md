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
11. When a replacement is verified, remove the superseded implementation,
    unused imports/exports, obsolete compatibility styling, and tests that
    exist only for unreachable code. Keep compatibility paths only when they
    still protect real stored data or supported clients.
12. Never place a second implementation beside an older implementation for the
    same responsibility. Before completion, search every equivalent path and
    remove the replaced component, state, styles, utilities, and tests; verify
    that one authoritative implementation remains.

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

## Non-negotiable mobile and native contracts

These rules exist because real users were blocked by violations. Every rule
below is backed by a specific incident. Do not relax, rationalize, or
"improve" them without a rendered mobile verification and explicit user approval.

### GPS / Navigation — NEVER BLOCK OR ASK

- **NEVER** use `@capacitor/browser` `Browser.open()` for native URL schemes
  (`maps://`, `google.navigation:`, `waze://`, `tel:`, `sms:`). The Browser
  plugin intercepts the scheme redirect and opens its own WebView instead of
  handing off to the native app. **Always** use `window.location.href` directly.
- **NEVER** show `window.confirm()`, `ActionSheet`, bottom sheet, or any
  chooser before opening GPS. The user taps "Navigate" to go **now**, not to
  pick an app. Open the configured app immediately.
- **NEVER** add a timeout-based fallback (`openUrlWithFallback`) on navigation
  paths. A 2.5s timer can redirect to a web URL before the GPS app opens,
  losing the user's trip context.
- **NEVER** import or use `showNavActionSheet`. It is dead code. All navigation
  call sites must go through `openNavigation()` which opens directly.
- `openNavigation()` in `src/utils/nativeActions.js` is the single authority.
  Every navigation call site (DriverPage, MobileDispatchView, TripsPage,
  OperationsCommandCenter, EnterpriseRoutePlanner, TaskCard, MobileTripManifest,
  TripActionCenter) must call it. Do not bypass it with inline URL logic.

### Mobile login — NEVER LOCK SCROLL OR HIDE THE SUBMIT BUTTON

- **NEVER** lock `scrollTop` to 0 on any scrollable container when the keyboard
  opens. iOS auto-scrolls the focused input into view above the keyboard; a
  scroll lock prevents the user from reaching the submit button. The login
  button appeared to do nothing because the keyboard covered it and the scroll
  lock prevented iOS from revealing it.
- **NEVER** use `items-center` with `min-h-full` on the login stage
  (`.agape-login-stage`) on mobile. Use `items-start lg:items-center` so the
  form starts at the top on mobile and is centered only on desktop.
- **NEVER** add a `visualViewport` resize listener that manipulates scroll
  position on the login page. The only acceptable keyboard stabilization is
  setting `Keyboard.setResizeMode({ mode: KeyboardResize.None })` in the
  Capacitor native shell.
- **NEVER** place the submit button below the visible viewport on mobile. Test
  with the keyboard open on a 375px-wide viewport before deploying any login
  form change.

### Mobile filters — NEVER EXCEED 3 STATUS BUTTONS

- **NEVER** show more than 3 status filter buttons on any mobile page. The
  three are: All, Completed, Cancelled. "Cancelled" includes all non-completed
  outcomes (cancelled, no show, rerouted).
- **NEVER** place filter buttons on a separate sticky bar when they can share
  a single line with the date navigator. Mobile screen real estate is
  constrained; every extra row costs usability.
- **NEVER** show `No Show` or `Rerouted` as separate filter buttons on mobile.
  They are merged into the Cancelled filter with a combined count.
- The filter buttons use icon-only (`agape-mobile-icon-btn`) — do not add text
  labels on mobile. Desktop may use text labels.

### Native action patterns — ALWAYS USE THE SHARED UTILITIES

- `makeCall()` in `src/utils/nativeActions.js` is the single authority for
  phone calls. Never use `tel:` links directly in components.
- `sendSMS()` / `sendSMSWithBody()` in `src/utils/nativeActions.js` is the
  single authority for SMS. Never use `sms:` links directly in components.
- `openMapLink()` in `src/utils/nativeActions.js` is the single authority for
  map opens outside of navigation (e.g., showing a trip location without
  routing).
- Every native action must use `window.location.href` for URL scheme handoff
  on mobile. Never use `window.open()` or `Browser.open()` for `tel:`, `sms:`,
  `maps:`, or navigation schemes.

### Build and deploy discipline — NEVER SKIP THESE STEPS

- After every change, run `npm run build` AND `npx vitest run` (700/700 tests
  must pass). A passing build without tests is NOT evidence of correctness.
- After deploying to Firebase, **always** copy `dist/*` to
  `ios/App/App/public/` so the Capacitor app picks up changes.
- After copying to iOS, tell the user to **force-quit** the app. Hot reload
  does not work in the installed Capacitor app.
- Never deploy without first verifying the commit hash matches what was pushed.

## Agape UI conventions

- The application is light-only. Do not add theme selection or dark-mode variants.
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

## Performance and native-feel invariants

These are permanent product contracts, not optional cleanup work:

- Interactive trip, odometer, profile, and log saves must optimistically update
  the UI and atomically persist only the changed record plus its durable outbox
  command. Never serialize or rewrite a complete collection on an interactive
  single-record save path.
- A successful button response means the mutation is durably staged locally.
  Cloud delivery must start immediately, remain ordered and retryable, and show
  pending or blocked status visibly. Never silently discard or falsely confirm
  an unsynced mutation.
- `trips` is the sole realtime trip authority. `driverTripProgress` and
  `tripLedger` are atomic workflow mirrors; do not add parallel listeners that
  merge either mirror back into the main trip list.
- Network enrichment such as maps, routes, notifications, and audit expansion
  must not block the odometer or trip-status save critical path. Bound external
  requests with a short timeout and deduplicate identical in-flight requests.
- Lazy workspace modules should preload on authenticated role resolution and
  navigation intent. Expensive derived collections must be memoized or indexed;
  do not rescan all historical trips because unrelated navigation state changed.
- Preserve the protected mobile viewport baseline. Performance fixes must not
  change the app-shell height, global overflow contract, keyboard geometry, or
  bottom-navigation clearance.
- Every change to these paths requires the focused durability, workflow-boundary,
  sync-queue, interaction-latency, and mobile viewport contract tests, followed
  by a production build and representative mobile runtime inspection.
