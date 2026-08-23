---
name: agape-design-system
description: Design, audit, or implement Agape Care portal UI and UX. Use for pages, components, responsive layouts, visual polish, accessibility, design tokens, navigation, forms, tables, maps, chat, or requests to make the app premium.
---

# Agape Design System

Read `DESIGN.md` and the relevant shared components before editing.

Preserve the product language defined there: calm command-center clarity, healthcare trust, slate neutrals, light default, restrained depth, stable navigation, and native-feeling feedback. Project guidance overrides generic aesthetic recipes from other design skills.

Trace the complete user workflow and role before styling. Reuse `src/components/ui`, `src/components/admin/AdminKit.jsx`, and shared shells. Extend shared tokens or components when the same pattern appears in more than one place.

Implement all applicable loading, empty, populated, partial, permission, validation, retry, offline, stale-session, and success states. Keep mobile feature-complete with 48px touch targets and bottom-navigation clearance.

Verify rendered behavior at 390×844 and 1440×900, including keyboard focus, reduced motion, overflow, and error states. Do not treat a static screenshot or build as sufficient evidence.
