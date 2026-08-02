# Agape Care Security Operations

## Access lifecycle

Employee access is controlled by both Firebase Authentication and the live `users/{uid}` employment record. An account is denied when `disabled` is true, `active` is false, or its access/employment status is disabled, inactive, revoked, suspended, terminated, or separated.

When an employee leaves the company, an administrator must use **Admin → Users → Disable access** immediately. This action:

1. disables the Firebase Authentication account;
2. revokes all refresh tokens;
3. invalidates the employee's registered app sessions;
4. changes the live employment access record so Firestore and Storage deny every subsequent request; and
5. records the actor, reason, time, user, and invalidated-session count in the audit log.

Use **Delete permanently** only after retention and payroll obligations have been reviewed. Disabling access is the immediate offboarding control and preserves business history.

## Session policy

| Portal | Inactivity limit | Maximum session | Persistence | Active-work behavior |
| --- | ---: | ---: | --- | --- |
| Admin | 15 minutes | 12 hours | Browser session | Always enforced |
| Dispatcher | 30 minutes | 12 hours | Browser session | Always enforced |
| Driver | 30 minutes | 18 hours | Trusted browser | Inactivity timer pauses only while clocked in or actively performing a trip; the maximum limit remains enforced |

A two-minute warning appears before an inactivity or maximum-session logout. Selecting **Stay signed in** records fresh activity. Reloading the app does not bypass the maximum duration.

## Daily administrator checklist

- Disable access as soon as separation or suspension is reported.
- Review `security.user_access_disabled`, `security.user_access_restored`, and `security.user_removed` audit events.
- Investigate repeated sign-in failures, session movement between devices, and unexpected access restoration.
- Restore access only after identity and employment status are independently verified.
- Never share administrator accounts or reuse driver credentials.

## Firebase production controls

The web client supports Firebase App Check with reCAPTCHA Enterprise when `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` is configured. Roll it out in monitoring mode first, verify legitimate web/mobile traffic, then enforce it for Firestore, Storage, Authentication-supported endpoints, and callable Functions in the Firebase console.

Require multi-factor authentication for administrators and dispatchers through Firebase Authentication with Identity Platform. Maintain at least two independently controlled administrator accounts and test account recovery quarterly.

## Secrets and key rotation

- Gemini credentials are server-only and are read by Cloud Functions from encrypted runtime configuration.
- Google Maps browser keys must be restricted to the production web origins and only the required Maps APIs.
- Service-account JSON files must never be stored in the repository or distributed with the web app.
- Rotate any OAuth, Gemini, Maps, or service-account credential that was previously committed, copied into chat, or stored on an unmanaged computer. Removing a secret from the latest commit does not remove it from Git history.
- Use a managed secret scanner and repository push protection in CI.

## Incident response

For a lost device or suspected account compromise: disable the user, preserve audit records, rotate any locally stored integration credentials, inspect session and trip-change history, and restore access only after the device and identity are trusted again.
