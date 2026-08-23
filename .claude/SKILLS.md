# Project Skill Inventory

This inventory is documentation only; Claude does not load it automatically.

## Agape project skills

| Skill | Purpose |
|---|---|
| `agape-design-system` | Applies `DESIGN.md` to product UI, responsive behavior, states, and accessibility. |
| `agape-firebase-safety` | Protects Firestore, Storage, auth, offline queues, tenants, and production boundaries. |
| `agape-live-operations` | Covers dispatch, maps, tracking, chat, routes, time, payroll, and task control. |
| `agape-performance` | Profiles rendering, bundles, listeners, maps, and native-feeling interaction latency. |

## Anthropic official skills

Installed from [`anthropics/skills`](https://github.com/anthropics/skills) at commit `3b3fad96af16a10759d930941b4520ba0c40edae`:

| Skill | Intended use | Portability |
|---|---|---|
| `frontend-design` | Distinctive production frontend design | High; Agape rules override generic aesthetic choices |
| `canvas-design` | Original posters and static visual compositions | Partial; uses bundled visual-generation workflow |
| `theme-factory` | Themes for presentations and artifacts | Partial; artifact-oriented, not the app design source of truth |
| `webapp-testing` | Local browser behavior and screenshots | High when Playwright/browser access is available |
| `doc-coauthoring` | Specs, proposals, and structured documentation | High |
| `docx` | Word documents and templates | Environment-dependent |
| `pdf` | PDF reading, editing, creation, OCR, and validation | Environment-dependent |
| `pptx` | Presentation creation and editing | Environment-dependent |
| `xlsx` | Spreadsheet creation, editing, formulas, and validation | Environment-dependent |
| `skill-creator` | Create or refine future focused skills | High |

`brand-guidelines` was intentionally excluded because it applies Anthropic's corporate brand rather than Agape Care's identity.

## Context and cost policy

- Keep always-loaded guidance in `CLAUDE.md` short.
- Keep exact visual decisions in `DESIGN.md`.
- Put repeatable or conditional workflows in skills so their bodies load only when relevant.
- Prefer one narrow skill per task. Do not invoke Canvas Design, Theme Factory, document skills, or testing skills for ordinary app edits unless the deliverable requires them.
- Review this list before adding more skills. More indexed descriptions and overlapping triggers can increase context use and reduce routing accuracy.
