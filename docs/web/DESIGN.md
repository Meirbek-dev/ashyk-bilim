# Design system (apps/web-2)

Spec: `docs/MODERNIZATION-STAGE-2.md` 5.2, 5.7, 5.8, 7.10. Tokens: `apps/web-2/src/styles/tokens.css`. Themes:
`apps/web-2/public/themes/<slug>.css` + `manifest.json`. Every rule below is meant to be checked by a gate, a lint
rule or the reference slice; a rule nobody can check does not belong here.

## 1. Principles

1. A calm working tool for studying. The screen answers one question (5.1) and shows one next step.
2. Hierarchy comes from type size, weight and spacing. No cards inside cards, no boxes around sections.
3. Color carries meaning (status, activity type, action) and never decorates. The meaning always has a second
   channel too: a label or an icon.
4. Motion only shows what changed after a user action, and lasts at most 200 ms.
5. One app shell plus one focus layout. Screens are built from the 6 templates (section 6) and nothing else.
6. Works from 390 px. WCAG 2.2 AA in all 63 themes, both modes (G-15).

## 2. Tokens

Our code (features, `shared/components`) uses only these tokens. Tailwind keeps its namespaces for the stock kit:
palette classes (`bg-red-500`, G-11), `text-3xl`, `font-bold`, `tracking-*`, `shadow-2xl` are forbidden in our code.

| Token (utility suffix)                          | Meaning                                    | Use                                                       |
| ----------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `background` / `foreground`                     | page surface and body ink                  | page canvas, all body text                                |
| `card` / `card-foreground`                      | a raised object surface                    | one object in a grid or list (course, submission)         |
| `popover` / `popover-foreground`                | floating surface                           | menus, popovers, dialogs, sheets                          |
| `primary` / `primary-foreground`                | the main action                            | the one primary button, selected nav item, progress fill  |
| `secondary` / `secondary-foreground`            | quieter actions                            | secondary buttons, neutral chips                          |
| `muted` / `muted-foreground`                    | low-emphasis surface and text              | skeletons, table header bg, meta lines, hints, timestamps |
| `accent` / `accent-foreground`                  | interactive hover or highlight             | hovered or focused menu and list rows only                |
| `destructive`                                   | danger, irreversible actions, errors       | delete buttons, field errors, failed status               |
| `success` / `warning` / `info`                  | status (derived, never set by themes)      | graded/passed, due soon/late, neutral notices             |
| `activity-<type>`                               | activity type (derived)                    | the type icon and type label (table in section 3)         |
| `border`                                        | dividers                                   | table rows, separators, card outline                      |
| `input`                                         | form control boundary, >= 3:1 on background | input, select, checkbox and switch outlines              |
| `ring`                                          | keyboard focus                             | the focus outline only                                    |
| `chart-1..5`                                    | data series                                | charts only, in slot order                                |
| `sidebar-*`                                     | the shell's navigation column              | the app shell sidebar and bottom bar only                 |

- A fill always comes with its own ink: `bg-X` goes with `text-X-foreground`. Status and activity tokens are
  never fills. They appear as `text-X`, `border-X/30` or `bg-X/10` with `text-X` (contrast >= 4.5:1 holds on
  background, on card and on the `/10` tint).
- Primary is never used as text color (`text-primary` is forbidden; it falls below 4.5:1 in about 40 themes). Links
  use the current text color with `underline underline-offset-4`.
- Non-color tokens: `--radius`, `--shadow-x|y|blur|spread|color`, `--density-*`, `--focus-ring-*` and
  `--duration-*`.
- Themes override only the "theme" group in tokens.css: 31 colors, `--radius` and the shadow parameters.
  Themes never set fonts, spacing or tracking, and never set the derived tokens. Mode comes from
  `html[data-mode="light"|"dark"]`; with no attribute the system setting applies. Each color is a `light-dark()`
  pair.
- Hex, `oklch()` and `dark:` only in `src/styles/`, `public/themes/` and the stock kit (G-11); the kit's `dark:` is one
  `@custom-variant` in globals.css: `data-mode="dark"`, or the system setting when it is absent or `system`.

## 3. Color meaning

| Meaning                          | Token         | Rule                                                                 |
| -------------------------------- | ------------- | -------------------------------------------------------------------- |
| passed, graded, published, saved | `success`     | with a label; never as the only signal                               |
| due within 48 h, late, draft     | `warning`     | with a label; due date also shown as text                            |
| informational notice, new item   | `info`        | at most one info notice per view                                     |
| failed, error, delete            | `destructive` | field errors sit under the field; destructive buttons need a confirm |

Activity types come from one `activityTypeMeta` table (icon, label key, token). The table is exhaustive over the
enum, and no other component maps a type to an icon or a color.

| Type              | Lucide icon      | Token                      |
| ----------------- | ---------------- | -------------------------- |
| `page`            | `NotebookText`   | `activity-page`            |
| `video`           | `Video`          | `activity-video`           |
| `document`        | `FileText`       | `activity-document`        |
| `file-submission` | `FileUp`         | `activity-file-submission` |
| `quiz`            | `ListChecks`     | `activity-quiz`            |
| `exam`            | `ClipboardCheck` | `activity-exam`            |
| `code`            | `CodeXml`        | `activity-code`            |

The type color goes on the icon (`text-activity-*`) and may go on a `/10` chip behind it. It never colors a
title, a row or a card background.

## 4. Typography

- Sans: `@fontsource-variable/inter@5.3.0` (OFL-1.1), `wght.css` + `wght-italic.css`: 18/18 Kazakh letters
  (`cyrillic` + `cyrillic-ext`) in roman and italic, `tnum` present; Onest and Golos Text lack the italic.
- Mono: `@fontsource-variable/geist-mono@5.3.0` (OFL-1.1), `wght.css`: 18/18 Kazakh letters. JetBrains Mono was
  rejected because its fontsource subsets are missing 12 of the 18 Kazakh letters.
- Weights: `font-normal` (body), `font-medium` (labels, buttons, table headers), `font-semibold` (headings).
- Numbers that line up (tables, scores, timers, counters) use `tabular-nums`.
- Text is never all-caps and never letter-spaced. Text width is at most `max-w-prose` for reading and 80ch for
  forms.

| Utility     | Size / line height | Use                                                              |
| ----------- | ------------------ | ---------------------------------------------------------------- |
| `text-2xl`  | 28 / 36            | page title (`h1`), one per page; content `h1`                    |
| `text-xl`   | 22 / 28            | section title (`h2`); content `h2`                               |
| `text-lg`   | 18 / 26            | focus-layout context title, dialog title; content `h3`           |
| `text-base` | 16 / 24            | reading text, form fields, comfortable lists                     |
| `text-sm`   | 14 / 20            | UI default: buttons, tables, meta lines, nav; compact density    |
| `text-xs`   | 12 / 16            | badges, timestamps in dense rows, chart axes; never a full sentence |

## 5. Spacing, radius, shadow, density

- Spacing uses only the Tailwind scale plus `control`, `row` and `gutter`. Arbitrary values (`p-[13px]`,
  `w-[...]`) are forbidden (G-11).
- Rhythm: `gap-1`/`gap-2` inside a control group, `gap-4` between fields, `gap-gutter` between blocks, and
  `gap-8`/`gap-12` between page sections. Page padding is `px-4` up to `md` and `px-6` above it.
- Radius: `rounded-sm` (badges, checkbox), `rounded-md` (inputs, buttons), `rounded-lg` (cards, popovers),
  `rounded-xl` (dialogs, sheets) and `rounded-full` (avatars, pills). These are multiples of the theme's
  `--radius`.
- Shadow: none on in-flow content. Use `shadow-xs` for raised controls, `shadow-md` for menus and popovers, and
  `shadow-lg` for dialogs and sheets. `shadow-sm` and `shadow-xl` exist only for kit primitives.
- Density: comfortable (default) for learning and reading; compact for teacher and admin tables. The layout or
  template sets `data-density="compact"` on its region. Features never pass density classes. Our composites use
  `h-control` (36 / 32 px), `min-h-row` (48 / 36 px) and `gap-gutter` / `p-gutter` (24 / 16 px); stock controls keep
  their own heights. Touch targets stay >= 24 px.

## 6. Layouts and templates

**App shell** (one for every role, 5.2). Desktop (>= `lg`): a top bar `h-14` with the logo, space switcher (only
when the user has more than one space), search / `Ctrl+K`, notifications and the profile menu. Below it, a
sidebar `w-60` holding the current space's navigation, then the content. At 390 px: the top bar keeps the logo,
search icon, notifications and profile, the space switcher moves into the profile menu, and the navigation
becomes a bottom bar `h-14` with at most 5 items, each an icon plus a label. Guests get the same shell without
the sidebar or bottom bar. Content sits in `mx-auto w-full max-w-6xl`.

**Focus layout** (5.2): no navigation. Top bar: back button, context title (`text-lg`, truncated), save status,
then actions on the right. Used by the activity player, attempt, activity editor and single-submission review.

| Template        | Anatomy (desktop)                                                                    | At 390 px                                                                 |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `ListPage`      | `h1` + count / actions right; filter row (search + filters, all in the URL); `DataTable`; "Show more" | actions: primary stays, rest in a menu; filters behind a "Filters (n)" sheet; `DataList` cards with priority columns |
| `DetailPage`    | object title + meta line (`text-sm text-muted-foreground`) + status + primary action right; tab links; `Outlet` | primary action full-width under the title; the tab row scrolls inside itself |
| `FocusPage`     | focus top bar; left panel (contents) `w-72`; main column `max-w-prose` or full width for editors; right panel (AI, rubric) `w-96` | panels become sheets opened from top-bar buttons; main column full width |
| `SettingsPage`  | section nav (route links) left; stacked sections: `h2` + one-line description + fields + its own Save at the section's end | section nav becomes the tab row; sections stack |
| `FormDialog`    | title, minimum fields, footer: Cancel (ghost) + Create (primary); on success, navigate to the new entity | the stock dialog at full width minus the gutter; scrolls inside |
| `ConfirmDialog` | "Delete course «X»?", consequence in one sentence, Cancel + destructive verb; focus starts on Cancel | same, full width |

- Tables switch to `DataList` with a container query (`@container`), not a viewport breakpoint. No page at 390 px
  scrolls horizontally (e2e fixture).
- Editors (block editor, code-test builder) are the only screens allowed to show a "desktop only" state.

## 7. Data states

Every data region renders exactly one of the kit's four states:

1. Loading: a skeleton of the final layout (`bg-muted`, static). Page loads show no spinner. `animate-spin` is
   used only inside a pending button.
2. Empty: one sentence on what will appear here, plus the create action when the user is allowed to create.
3. No matches: shown when a filter is in the URL. One sentence plus a "Reset filters" action.
4. Error / no access: the `ApiError` message from the code map plus "Retry"; a 403 is shown in place on the
   same URL.

## 8. Kit: shadcn base-nova + our composites

- `src/shared/ui/` is stock shadcn (`components.json`, `base-nova` on Base UI): `bunx shadcn@4.21.1 add <name>` when a
  feature needs a primitive, `add --diff` to update. No hand edits beyond those listed in docs/DECISIONS.md.
- `src/shared/components/` is ours, under every lint and token rule: templates, form fields (`useAppForm`), data
  regions, `IconButton`, `StatusBadge`, `ErrorAlert`, `SheetPanel`, menus. A look the stock kit lacks (status
  tones, link looks, a dialog width) is a variant there; features pass layout classes only, never restyle.
- Features use stock props (`variant`, `size`, `render`); a route link that looks like a button is the router
  `Link` with `className={buttonVariants({ variant })}`. Pending: `disabled` + `<Spinner data-icon="inline-start" />`.

## 9. Component rules

- One primary button per view: one in a template header and one in each dialog footer. Everything else is
  secondary, outline or ghost.
- Every destructive action goes through `ConfirmDialog` with the object's name. The `destructive` button variant
  appears only in that dialog and in a settings "danger zone" that opens it.
- Create = `FormDialog`, then navigate to the entity's workspace. Edit = a page. Each object has one edit place
  and one review place.
- Tabs are route links (`<Link>`); the label and the URL segment are the same word. No tabs in component state.
- Icons are lucide named imports, `size-4` next to `text-sm` and `size-5` next to `text-base`. An icon appears
  only when it carries meaning (type, status, a known action). Icon-only buttons have an `aria-label` and a
  tooltip.
- A toast appears only from a mutation's `onSuccess`, in the past tense of the button's verb. Errors stay on the
  page: inline, under the field or in the region.
- Status badges come from an exhaustive `Record<Status, {label, token}>`, never from ad-hoc classes.
- A card is one object. Sections are separated by headings and spacing, not by borders around them.

## 10. Motion and focus

- Our code: only `transition-colors|opacity|transform`, `duration-100|150|200` (or `--duration-*`); motion only for
  overlays, accordions, a rotating chevron and progress; no hover scale, translate, bounce, pulse or entrance
  animation. Stock overlays animate with tw-animate-css. Reduced motion zeroes every duration (tokens.css).
- Focus: the global `:focus-visible` outline in `ring` (2 px, offset 2 px); stock controls draw their own `ring`.
  Never `outline-none` without an equal replacement. Focus order follows visual order.

## 11. Writing tone (ru / kk / en)

- Buttons: a short verb in sentence case, no "please", no "!": «Сохранить» / «Сақтау» / "Save". The toast repeats
  it in the past tense: «Сохранено» / «Сақталды» / "Saved".
- Errors say what happened and what to do next, never apologize or blame: «Файл больше 50 МБ. Выберите файл поменьше.»
- Formal «вы» (ru, lowercase) and «сіз» (kk). Confirmations name the object and the consequence; empty states invite
  one action. Terms only from the 7.9 glossary; dates and numbers only from the format module.

## 12. Never

- gradients, glass/blur surfaces, decorative icons (`Sparkles`, `Rocket`, `Flame`, `Zap`, `PartyPopper`, `Wand2`)
- palette classes, `dark:`, hex, inline `style`, arbitrary values in our code (G-11); `text-primary` as text color
- cards inside cards, a second primary button, a delete without confirmation; color as the only signal
- all-caps labels, letter-spacing, `font-bold`, sizes outside the six above; animations > 200 ms, hover scale or lift
- horizontal scroll at 390 px; "desktop only" outside the two editors; tabs in state; edit forms in dialogs
