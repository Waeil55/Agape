---
version: alpha
name: Agape Care Command
description: Calm, premium, high-trust transportation operations for dispatchers, administrators, and drivers.
colors:
  brand-navy: "#0F1E3D"
  primary: "#2563EB"
  brand-hover: "#1D4ED8"
  brand-soft: "#DBEAFE"
  canvas: "#F4F7FC"
  surface: "#FFFFFF"
  surface-subtle: "#F8FAFD"
  ink: "#172033"
  ink-secondary: "#64748B"
  ink-tertiary: "#94A3B8"
  border: "#E7EDF5"
  border-strong: "#D8E2EF"
  success: "#10B981"
  success-soft: "#EAFBF4"
  success-text: "#047857"
  warning: "#F59E0B"
  warning-soft: "#FFF7E6"
  warning-text: "#92400E"
  danger: "#EF4444"
  danger-soft: "#FDECEC"
  danger-text: "#B91C1C"
  focus: "#3B82F6"
typography:
  display:
    fontFamily: Outfit
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: -0.03em
  title:
    fontFamily: Outfit
    fontSize: 1.9rem
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
  heading:
    fontFamily: Outfit
    fontSize: 1.35rem
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.04em
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 20px
  overlay: 40px
  full: 9999px
spacing:
  micro: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  section: 40px
  touch: 48px
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
  metadata:
    textColor: "{colors.ink-secondary}"
  placeholder:
    textColor: "{colors.ink-tertiary}"
  brand-header:
    backgroundColor: "{colors.brand-navy}"
    textColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.border-strong}"
    height: 1px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    height: "{spacing.touch}"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-soft:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand-hover}"
  input:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "{spacing.touch}"
  focus-indicator:
    backgroundColor: "{colors.focus}"
    size: 2px
  status-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-text}"
  status-success-indicator:
    backgroundColor: "{colors.success}"
    size: 8px
  status-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-text}"
  status-warning-indicator:
    backgroundColor: "{colors.warning}"
    size: 8px
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-text}"
  status-danger-indicator:
    backgroundColor: "{colors.danger}"
    size: 8px
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.overlay}"
---

# Agape Care Design System

## Overview

Agape Care should feel like a top-tier native operations product: calm under pressure, precise with sensitive data, fast to scan, and unmistakably trustworthy. The visual reference is a modern fleet command room softened by healthcare hospitality—not a generic SaaS dashboard and not a decorative consumer app.

Default to light mode. Use confident hierarchy, quiet surfaces, compact operational density, and one clear primary action per region. Premium means disciplined alignment, excellent states, and immediate feedback; it does not mean excessive glass, gradients, animation, or decoration.

Every screen must answer three questions within seconds: where am I, what needs attention, and what can I safely do next?

## Colors

Use the slate-based neutral system already implemented in Tailwind and `src/index.css`.

- **Command navy** `{colors.brand-navy}` anchors identity, major headings, and rare hero regions.
- **Action blue** `{colors.primary}` is reserved for primary actions, active navigation, links, and focus—not large decorative areas.
- **Canvas** `{colors.canvas}` separates the application frame from white work surfaces.
- **Ink** `{colors.ink}` carries primary information. Secondary and tertiary ink are for metadata, never important warnings.
- **Semantic colors** communicate verified state only. Never use green for an unverified success or red as decoration.
- Never introduce Tailwind `gray-*`; use `slate-*` and the existing semantic tokens.
- Dark mode is opt-in. Do not make dark mode the default or reduce contrast to look fashionable.

## Typography

Outfit gives headings a clear Agape signature; Inter keeps dense operational data legible. Use semibold for headings and body emphasis. Reserve bold weight for actions, critical totals, and badges.

- Prefer sentence case. Avoid all-caps except short labels and badges.
- Use tabular numerals for time, mileage, money, counts, and odometers.
- Keep mobile body text at least 14px and controls at least 16px where browser zoom prevention matters.
- Truncate only when the full value remains available through a detail view, accessible label, or expansion.

## Layout & Spacing

Use a responsive operational grid. Desktop provides persistent navigation and parallel context; mobile provides one primary task per view with stable five-item bottom navigation.

- Build from the 4px base scale, with 8px and 16px as the dominant rhythm.
- Use `rounded-xl` cards and reserve `rounded-3xl` for modals and overlays.
- Keep primary mobile controls at least `{spacing.touch}` high and provide `pb-24` clearance behind bottom navigation.
- Collapse advanced filters on mobile; show the queue, map, conversation, or task before secondary controls.
- Avoid nested scrolling when one clear page scroll is possible.
- Preserve safe-area insets in native shells and bottom sheets.

## Elevation & Depth

Create depth with tonal layers, fine borders, and restrained ambient shadows. Most cards use a subtle border and low elevation. Floating navigation, menus, and dialogs may use stronger elevation.

Avoid stacking blur effects. Backdrop blur belongs to fixed navigation or overlays only and must not sit behind long scrolling lists. Never animate layout-heavy properties on operational screens.

## Shapes

The shape language is precise and softly architectural. Cards and controls use consistent 12px corners. Overlays may be more generous, but nested elements should not form a pile of unrelated radii.

Icons are Lucide line icons with consistent optical size. Do not mix emoji, filled clip art, or multiple icon families into application chrome.

## Components

Reuse `src/components/ui`, `src/components/admin/AdminKit.jsx`, and shared portal shells before creating a page-specific control.

- **Navigation:** Keep destinations stable. Active state needs color, shape, and `aria-current`; do not rely on color alone.
- **Cards:** One purpose per card. Put the decision or status first, supporting metadata second, and actions last.
- **Buttons:** One dominant primary action per region. Destructive actions require explicit labeling and confirmation proportional to risk.
- **Forms:** Labels remain visible. Validation is inline and specific. Saving, saved, rejected, offline, and retry states must be distinguishable.
- **Tables and manifests:** Keep headers stable, numbers aligned, and row actions keyboard reachable. On mobile, convert records into information-prioritized cards rather than shrinking a desktop table.
- **Modals and sheets:** Trap focus, support Escape, restore focus, and keep the final action visible. Use bottom sheets for mobile workflows.
- **Chat:** Conversation content dominates; search, details, attachment, mute, and member tools remain secondary. Drafts containing sensitive information stay in current-session memory.
- **Maps and tracking:** The map supports decisions rather than becoming decoration. Always provide text status, last update age, selected driver context, loading, permission, stale, and provider-failure states outside the map canvas.
- **Time and payroll:** Use tabular clocks and explicit date scope. Ambiguous source timestamps block exports or approvals instead of being guessed.
- **Tasks and dispatch:** Show owner, service date, state, urgency, and next safe action. Never hide an unaccounted trip behind a count or optimistic success state.
- **Motion:** Use 140ms feedback and 220–340ms content transitions with transform and opacity only. Respect `prefers-reduced-motion`; avoid perpetual motion except genuine progress indicators.

Every data surface needs loading, empty, populated, partial, permission-denied, validation-failure, retry, offline, stale-session, and success handling where applicable.

## Do's and Don'ts

### Do

- Design from the real workflow and role permissions before styling.
- Make status and next action understandable without opening a modal.
- Test at 390×844 and 1440×900, plus keyboard and reduced-motion behavior.
- Prefer progressive disclosure and lazy loading for secondary tools.
- Use real application data structures and deterministic date helpers.
- Preserve Firebase identifiers, Storage paths, offline queues, and tenant boundaries.

### Don't

- Do not add generic purple gradients, glass everywhere, oversized empty hero areas, or ornamental charts.
- Do not duplicate shared components with slightly different spacing or colors.
- Do not make every card clickable or every action visually primary.
- Do not use `transition-all`, broad mobile blur, or expensive rerenders for cosmetic polish.
- Do not infer trips, locations, times, mileage, signatures, identities, or successful sync.
- Do not call a UI complete from a screenshot or build alone; verify the live workflow on desktop and mobile.
