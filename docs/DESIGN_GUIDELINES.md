## Component Redesign Guidelines: Replace Vibe-Coded Styling with the shadcn/ui Design System

The app currently appears to have been vibe coded: many components use ad hoc visual styling instead of a consistent design system. The goal is to refactor the UI so it feels cohesive, maintainable, and aligned with shadcn/ui conventions.

### Primary Objective

Redesign components that contain hardcoded Tailwind visual values and replace them with semantic shadcn/ui design tokens, reusable primitives, and consistent interaction patterns.

Do not merely “make it look nicer.” The task is to remove inconsistent, vibe-coded styling and normalize the app around the existing design system.

---

## What to Look For

Audit all components for hardcoded Tailwind classes such as:

```tsx
text-gray
text-gray
bg-white
bg-slate
border-gray
text-indigo
bg-indigo
from-purple
to-pink
shadow-xl
rounded-3xl
etc.
```

Also look for visual noise and decorative elements that do not belong in a product UI, including:

Remove or replace lucide icons that feel decorative, hype-driven, or unrelated to the actual action or content.

Also audit for excessive or inconsistent animation patterns, including (when used out of place):

```tsx
animate-bounce
animate-pulse
hover:scale
active:scal
transition-all
rotate-*
translate-y-*
motion.div
whileHover
whileTap
initial
animate
exit
```

Remove jumpy, playful, or distracting movement unless it has a clear UX purpose.

---

## Required Design System Direction

Use shadcn/ui tokens instead of hardcoded colors.

Prefer:

```tsx
bg - background
bg - card
bg - muted
bg - primary
bg - secondary
bg - accent
text - foreground
text - muted - foreground
text - primary
border - border
ring - ring
```

Avoid:

```tsx
bg - white
bg - gray
bg - slate
text - gray
text - indigo
border - gray
etc
```

Use semantic variants from shadcn/ui components where available.

For example, prefer:

```tsx
<Button variant="default">
<Button variant="secondary">
<Button variant="outline">
<Button variant="ghost">
<Button variant="destructive">
```

Instead of custom button styling like:

```tsx
<button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 shadow-lg">
```

---

## Gradients

Remove gradients unless they are part of a deliberate, documented brand treatment.

Avoid:

```tsx
bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500
bg-gradient-to-br from-slate-900 to-indigo-900
text-transparent bg-clip-text bg-gradient-to-r
```

Replace with stable system colors:

```tsx
bg - background
bg - card
bg - muted
text - foreground
text - primary
```

Gradients should not be used to make weak hierarchy feel more exciting. Fix hierarchy with spacing, typography, layout, and semantic color.

---

## Icons

Use icons only when they clarify meaning.

Good examples:

```tsx
Search
Settings
User
Calendar
ChevronRight
Check
AlertCircle
Trash
Edit
Plus
Download
Upload
```

Avoid decorative or hype icons unless the feature genuinely requires them:

```tsx
Sparkles
Rocket
Flame
Zap
PartyPopper
Wand2
Star
```

If an icon is only there to make the UI feel energetic, remove it.

---

## Motion and Transforms

Motion should be minimal, predictable, and functional.

Remove excessive effects such as:

```tsx
hover:scale
hover:-translate-y
animate-bounce
animate-pulse
whileHover={{ scale: 1.05 }}
whileTap={{ scale: 0.95 }}
etc
```

Acceptable motion:

```tsx
transition - colors
transition - opacity
duration - 150
duration - 200
```

Use transforms only when they serve a clear interaction purpose, such as opening a dropdown, rotating a chevron, or animating a sheet/dialog.

Avoid making cards jump, grow, float, wiggle, or pulse.

---

## Shadows, Radius, and Borders

Normalize surfaces using shadcn/ui conventions.

Avoid excessive custom styling:

```tsx
shadow-2xl
shadow-indigo-500/20
rounded-3xl
border-gray-100
```

Prefer:

```tsx
rounded - lg
rounded - md
border
border - border
bg - card
shadow - sm
```

Use strong shadows sparingly. Most app surfaces should rely on border, spacing, and background contrast rather than dramatic shadowing.

---

## Component Refactor Rules

For each component:

1. Identify hardcoded color classes.
2. Replace them with semantic shadcn/ui tokens.
3. Remove decorative icons that do not communicate function.
4. Remove gradients unless truly necessary.
5. Remove excessive hover scaling, bouncing, jumping, pulsing, or animated transforms.
6. Replace custom buttons, cards, badges, inputs, dialogs, dropdowns, and tables with shadcn/ui primitives where possible.
7. Preserve behavior and business logic.
8. Improve visual consistency without changing product functionality.
9. Ensure dark mode works automatically through semantic tokens.
10. Keep the UI calm, professional, and system-driven.

---

## Before / After Example

### Before

```tsx
<div className="rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 p-6 shadow-2xl hover:scale-105 transition-all">
  <div className="flex items-center gap-2 text-white">
    <Sparkles className="h-5 w-5 animate-pulse" />
    <h2 className="text-2xl font-bold">Supercharge your workflow</h2>
  </div>
  <p className="mt-2 text-indigo-100">Launch your productivity into orbit.</p>
</div>
```

### After

```tsx
<Card>
  <CardHeader>
    <CardTitle>Workflow overview</CardTitle>
    <CardDescription>Review current activity and available actions.</CardDescription>
  </CardHeader>
  <CardContent>{/* Existing content */}</CardContent>
</Card>
```

---

## Tone of the Redesign

The final UI should feel:

Professional
Consistent
Quiet
Readable
Product-focused
Aligned with shadcn/ui
Maintainable
Dark-mode compatible

The UI should not feel:

Vibe coded
Over-animated
Gradient-heavy
Icon-stuffed
Toy-like
Hype-driven
Inconsistent
Visually improvised

---

## Coding Agent Instruction

When editing the codebase, treat hardcoded Tailwind color usage and excessive decorative styling as technical debt. Replace these patterns with shadcn/ui-compatible design tokens and primitives. The goal is to move the app from a vibe-coded interface to a disciplined, design-system-driven product UI.
