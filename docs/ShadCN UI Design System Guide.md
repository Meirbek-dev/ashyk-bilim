# ShadCN UI Migration Guide

## Objective

Migrate all UI components, pages, layouts (Next.js 16 + React 19) to the ShadCN UI design system
with full dark mode support, accessibility, and consistency.

This document is intended for an LLM coding agent. Follow instructions deterministically.

---

## Core Principles

- Prefer using shadcn ui components and their variants
- All styling must use Tailwind CSS utility classes.
- Use design tokens via CSS variables (from ShadCN theme).
- No hardcoded colors like `#fff`, `#000`, etc.
- Preserve ARIA roles, keyboard navigation, focus states.
- All components must support dark mode via `class` strategy.

---

## Replacement Rules

For each component:

1. Reapply styling using Tailwind

## Styling Rules

### DO

- Use semantic classes: `bg-background`, `text-foreground`
- Use spacing scale: `p-4`, `gap-6`

### DO NOT

- Hardcode colors
- Use inline styles

---

## Dark Mode Rules

Every component must:

- Use semantic tokens
- Avoid fixed colors

Example:

```tsx
<div className="bg-background text-foreground ps-4">
```

---

## Refactoring Checklist (Per Component)

- [ ] Removed legacy styles
- [ ] Uses Tailwind only
- [ ] Supports dark mode
- [ ] Accessible
- [ ] No console errors

---

## Anti-Patterns (Strictly Forbidden)

- Mixing UI systems
- Copy-pasting old CSS
- Hardcoded colors
- Recreating components already in ShadCN

---

## Output Requirements for LLM Agent

For each migrated file:

1. Ensure imports are correct
2. Ensure TypeScript types are valid

---

## Example Task for Agent

Output:

- Dark mode compatible
- Tailwind-only styling

---

## Completion Criteria

Migration is complete when:

- Dark mode works globally
- No legacy CSS remains
- UI is consistent

---

## Notes

- Prioritize correctness over speed
- Prefer composition over customization
- Reuse components aggressively
