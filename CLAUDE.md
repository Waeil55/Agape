# Agape Care AI Context

Read `AGENTS.md` before changing or reporting repository behavior. It contains the authoritative safety, Firebase, WellTrans, validation, Git, and deployment contract.

For any UI, UX, visual, responsive, accessibility, or interaction work, read `DESIGN.md` before editing. Treat its tokens and product rationale as the design source of truth; existing shared components remain the implementation source of truth.

Use project skills in `.claude/skills/` only when their descriptions match the task. Prefer the narrowest relevant skill so unused instructions do not consume context.

Core commands:

- `npm test`
- `npm run lint`
- `npm run build`

Never change production Firebase data, rules, Storage, credentials, deployments, or external portals unless the user explicitly requests that exact mutation. Preserve unrelated working-tree changes. The repository may contain damaged Git objects; do not run destructive Git repair commands.
