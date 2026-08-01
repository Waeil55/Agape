AGAPE CARE WELLTRANS AGENT - MANAGED WINDOWS INSTALL

1. Right-click the downloaded ZIP and choose Properties.
2. If an Unblock checkbox appears, select it and click OK.
3. Extract the ZIP. Do not run files from inside the compressed folder.
4. Open the extracted agape-welltrans-agent folder.
5. Double-click Install-Agent.cmd.
6. Return to Agape, select a date, and click Reconcile & Fill Date.

The installer is per-user and does not request Windows administrator access.
It verifies the official Node.js runtime before installing it. Preferred
enterprise enrollment uses an administrator-issued agape-worker-wif.json
external-account configuration with short-lived Google credentials. Existing
DPAPI-protected service-account enrollment is a migration-only fallback.

If Windows Application Control blocks Install-Agent.cmd, your organization
must allowlist this Agape package or provide an organization code-signing
certificate. Do not disable Windows security controls.
