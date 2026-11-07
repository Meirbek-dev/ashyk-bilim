# Design system (apps/web-2)

Tokens: `apps/web-2/src/styles/tokens.css`. Themes: `apps/web-2/public/themes/<slug>.css` + `manifest.json`. Every
rule below is checked by a gate, a lint rule or the reference slice; a rule nobody can check does not belong here.

## 1. Principles

Identity: **a calm, exact tool in plain neutrals: white and near-black ink by day, near-black and off-white by night, hairlines between things, one blue**. No tint in the greys, warm or cool. Character comes from type and spacing,
never from decoration: no ornament, patterns, serif display type or paper-book skeuomorphism. The loudest thing on a screen
is what people uploaded, so everything around it stays quiet. If a screen could be any SaaS with the logo swapped, or would
look out of place in a Linear-grade tool, it is not finished.

1. A study tool people look forward to opening. A screen answers one question, shows one next step and the
   learner's progress (the level, the streak, the bar) where they act.
2. Three things carry the look:
   - **The type.** Geologica for headings and big numbers, Commissioner for everything else, lesson text included. Large
     titles, small quiet labels, nothing in between that shouts.
   - **The page.** Hairline rules, aligned columns, generous margins. A table is a typeset table. A list is rows on the
     paper. Boxes are the exception. Dotted leaders only in a course's table of contents.
   - **The picture.** `CourseCover` is a course's upload, whole, at 16:9 (uploads carry their own lettering), or a quiet
     grey field (`.ab-dye`) with the platform's emblem. It prints nothing: the title is set once, on the page under it.
3. Quiet tools, a little louder only when a learner arrives somewhere (a finished course, a certificate): bigger type and
   a solid ink field (`data-dye="ink"`), never decoration. Teacher and admin screens stay compact and quiet. Progress is a solid track.
4. Hierarchy comes from type size, weight and spacing. No cards inside cards, no boxes around sections.
5. Color carries meaning (status, activity type, action, reward) and never decorates, except a course's quiet field. The
   meaning always has a second channel too: a label or an icon.
6. Motion only shows what changed after a user action, and lasts at most 200 ms.
7. One app shell plus one focus layout. Screens are built from the templates (section 6) and nothing else.
8. Works from 390 px. WCAG 2.2 AA in all 63 themes, both modes (G-15).

## 2. Tokens

Our code (features, `shared/components`) uses only these tokens. Tailwind keeps its namespaces for the stock kit:
palette classes (`bg-red-500`, G-11), `text-4xl`, `font-bold`, `tracking-*`, `shadow-2xl` are forbidden in our code.

| Token (utility suffix)                          | Meaning                                    | Use                                                       |
| ----------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `background` / `foreground`                     | page surface and body ink                  | page canvas, all body text                                |
| `card` / `card-foreground`                      | a raised object surface                    | one object in a grid or list (course, submission)         |
| `popover` / `popover-foreground`                | floating surface                           | menus, popovers, dialogs, sheets                          |
| `primary` / `primary-foreground`                | the main action                            | the one primary button, in ink, not colour                |
| `secondary` / `secondary-foreground`            | quieter actions                            | secondary buttons, neutral chips                          |
| `muted` / `muted-foreground`                    | low-emphasis surface and text              | skeletons, table header bg, meta lines, hints, timestamps |
| `accent` / `accent-foreground`                  | interactive hover or highlight             | hovered or focused menu and list rows only                |
| `destructive`                                   | danger, irreversible actions, errors       | delete buttons, field errors, failed status               |
| `success` / `warning` / `info`                  | status (derived, never set by themes)      | graded/passed, due soon/late, neutral notices             |
| `reward`                                        | XP, levels, streaks (derived)              | XP amounts, streak flame, top-3 ranks                     |
| `activity-<type>`                               | activity type (derived)                    | the type icon and type label (table in section 3)         |
| `border`                                        | dividers                                   | table rows, separators, card outline                      |
| `input`                                         | form control boundary, >= 3:1 on background | input, select, checkbox and switch outlines              |
| `ring`                                          | keyboard focus                             | the focus outline only                                    |
| `chart-1..5`                                    | data series                                | charts in slot order                                      |
| `highlight` / `highlight-foreground`, `link`    | the interface's one colour (derived; other themes: primary, foreground) | switch, checkbox, radio, progress fill; `link`: links on the page |
| `sidebar-*`                                     | the shell's navigation column              | the app shell sidebar and bottom bar only                 |
| `media` / `media-foreground`                    | the video stage (fixed, every theme)       | the video player's frame and controls only                |

- A fill always comes with its own ink: `bg-X` goes with `text-X-foreground`. Status and activity tokens are
  never fills. They appear as `text-X`, `border-X/30` or `bg-X/10` with `text-X` (contrast >= 4.5:1 holds on
  background, on card and on the `/10` tint).
- Primary is never used as text color (`text-primary` is forbidden; it falls below 4.5:1 in about 40 themes). Links
  use `text-link` with a quiet underline (`Link`'s default look, `.ab-prose a`).
- Non-color tokens: `--radius`, `--shadow-x|y|blur|spread|color`, `--density-*`, `--focus-ring-*`, `--duration-*`.
- Themes override only the "theme" group in tokens.css: 31 colors, `--radius` and the shadow parameters; never
  fonts, spacing, tracking or the derived tokens. Mode comes from `html[data-mode="light"|"dark"]`; with no
  attribute the system setting applies. Each color is a `light-dark()` pair.
- Hex, `oklch()` and `dark:` only in `src/styles/`, `public/themes/` and the stock kit (G-11); the kit's `dark:` is one
  `@custom-variant` in globals.css: `data-mode="dark"`, or the system setting when it is absent or `system`.

## 3. Color meaning

| Meaning                          | Token         | Rule                                                                 |
| -------------------------------- | ------------- | -------------------------------------------------------------------- |
| passed, graded, published, saved | `success`     | with a label; never as the only signal                               |
| due within 48 h, late, draft     | `warning`     | with a label; due date also shown as text                            |
| informational notice, new item   | `info`        | at most one info notice per view                                     |
| failed, error, delete            | `destructive` | field errors sit under the field; destructive buttons need a confirm |

Activity types: one `activityTypeMeta` table (icon, label key, token), exhaustive over `ActivityType`; nothing else
maps a type to an icon and a token. Every type token is the same quiet ink by default (the shape tells types apart; a theme may keep it); it goes on the icon (`text-activity-*`) and may go on a `/10` chip
behind it; it never colors a title, a row or a card background.

| Type              | Lucide icon      | Token                      |
| ----------------- | ---------------- | -------------------------- |
| `dynamic` (page)  | `NotebookText`   | `activity-page`            |
| `video`           | `Video`          | `activity-video`           |
| `document`        | `FileText`       | `activity-document`        |
| `file_submission` | `FileUp`         | `activity-file-submission` |
| `quiz`            | `ListChecks`     | `activity-quiz`            |
| `exam`            | `ClipboardCheck` | `activity-exam`            |
| `code_challenge`  | `CodeXml`        | `activity-code`            |
| `custom` (legacy) | `Puzzle`         | `activity-page`            |

## 4. Typography

- Default set `press` (the name is a stored cookie value): Geologica (`font-heading`: every `h1`-`h3`, big numbers) and
  Commissioner (UI and `font-reading`: lesson text); Geist Mono for code in every set. Others: `inter` (Inter + Geologica), and
  one family each: `geist`, `google`, `plex`, `inter-tight`, `sn-pro`, `rubik`, `ubuntu`, `onest` (no italic), `noto`,
  `literata` (serif), `system`. Picked in /settings/appearance: cookie `ab_font`
  (this browser), SSR `html[data-font]`, tokens.css maps it to `--typeface-*`. Each face: 18/18 Kazakh letters and
  tabular digits checked in the shipped woff2 (fail: Manrope, Unbounded, Wix Madefor, Sofia Sans, JetBrains Mono).
- Weights: `font-normal` (body), `font-medium` (labels, buttons), `font-semibold` (headings; Geologica draws them at 500,
  `--heading-weight`, so a heading never reads heavy). Bold never.
- Numbers that line up (tables, scores, timers, counters) use `tabular-nums`.
- Never all-caps or letter-spaced text. Width at most `max-w-prose` for reading and 80ch for forms.
- The scale is a step larger than a typical web app's: many teachers are older and read at arm's length. Text size
  (/settings/appearance and the profile menu, cookie `ab_size`, SSR `html[data-size]`) multiplies the root size by
  112.5 % or 125 %; every size and space is in rem, so a new style never uses px for text or controls.

| Utility     | Size / line height | Use                                                              |
| ----------- | ------------------ | ---------------------------------------------------------------- |
| `text-display` | 40-72 / 1.03    | the landing's `h1`, a level number                               |
| `text-3xl`  | 30-40 / 1.08       | hero `h1` (home, auth, a page with a cover), status pages        |
| `text-2xl`  | 34 / 40            | page title (`h1`), one per page; content `h1`                    |
| `text-xl`   | 24 / 31            | section title (`h2`); content `h2`                               |
| `text-lg`   | 20 / 28            | focus-layout context title, dialog title, row titles; content `h3` |
| `text-base` | 17 / 26            | reading text, form fields (at every width), list row names       |
| `text-sm`   | 15 / 22            | UI default: buttons, tables, meta lines, nav; compact density    |
| `text-xs`   | 13 / 18            | badges, table heads, timestamps in dense rows, chart axes; never a full sentence |

## 5. Spacing, radius, shadow, density

- Spacing uses the Tailwind scale plus `control`, `row` and `gutter`. Arbitrary values and inline geometry are
  for what the scale cannot say (a seek bar's position, pane sizes, editor and chart layout); colors stay tokens.
- Rhythm: `gap-1`/`gap-2` inside a control group, `gap-4` between fields, `gap-gutter` between blocks, and
  `gap-8`/`gap-12` between page sections. Page padding is `px-4` up to `md` and `px-8` above it.
- Radius (multiples of the theme's `--radius`, 5 px by default): `rounded-sm` badges, checkbox, menu rows; `rounded-md`
  inputs, buttons; `rounded-lg` cards, popovers, dialogs; `rounded-full` avatars. Sections are not boxes: they sit on the
  paper, split by hairlines; a card holds one object you could pick up.
- Shadow: nothing in flow is shadowed or rises. `shadow-md` for menus and
  popovers, `shadow-lg` for sheets and toasts. Dialogs rest on a plain scrim (`bg-black/40`, no blur) with a hairline
  ring; a dialog's footer is a hairline to the edges with no tinted band.
- Density: comfortable (default) for learning and reading; compact for teacher and admin tables. The layout or
  template sets `data-density="compact"` on its region. Features never pass density classes. Our composites use
  `h-control` (44 / 40 px), `min-h-row` (56 / 52 px) and `gap-gutter` / `p-gutter` (28 / 24 px); the kit's controls use
  the same tokens; a small button is `h-9` (36 px). Touch targets stay >= 24 px.

## 6. Layouts and templates

**App shell** (one for every role). Desktop (>= `lg`): a full-height rail `w-64` in the sidebar colours (a step off white by day, the page's black by night, split by a hairline),
collapsible to icons: the wordmark, the space switcher (only with more than one space), the space's navigation (current
item: a tint), then at its foot `UniversityMark`. Beside it a
utility bar `h-14` on the paper (search with its `Ctrl+K`, notifications, profile) over the content. At 390 px: mark
only, search icon, notifications and profile; the space switcher moves into the profile menu, and the navigation becomes
a bottom bar `h-14` of at most 5 icon + label items. Guests get a bar with the wordmark, `UniversityMark` and public links, and the footer
(`SiteFooter`: the two marks) under the page. Auth pages: the form on the paper beside a plain ink panel from lg. The university's navy artwork
switches to white in dark mode, including system mode before hydration. Content sits in `mx-auto w-full max-w-6xl`.

**Focus layout**: no navigation. Top bar (sticky, like the side panels): back, context title (`text-lg`,
truncated), save status, actions right. Used by the activity player, attempt, activity editor and single-submission review.

| Template        | Anatomy (desktop)                                                                    | At 390 px                                                                 |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `ListPage`      | `h1` + count / actions right; filter row (search + filters, all in the URL); `DataTable`; "Show more" | actions: primary stays, rest in a menu; filters behind a "Filters (n)" sheet; `DataList` cards with priority columns |
| `DetailPage`    | title + meta line (`text-sm text-muted-foreground`) + status + primary action; tab links; `Outlet`. `cover` hero: the picture stands left in a 20rem column, title `text-3xl`, action under it; `coverSize="thumb"` (workspaces): a small picture before a `text-xl` title of at most two lines (the full name is its tooltip), action right. Tabs past the frequent ones go under «Ещё» (`staticData.tabs[].more`) | cover above the title; primary action full-width under it; the tab row scrolls inside itself |
| `FocusPage`     | focus top bar; left panel (contents) `w-80`; main column `max-w-[44rem]` or full width for editors; right panel (AI, rubric) `w-96`, closed until its named toggle in the bar opens it (remembered per browser, `ab.focus-aside`) | panels become sheets opened from top-bar buttons; main column full width |
| `SettingsPage`  | section nav (route links) left; stacked sections: `h2` + one-line description + fields + its own Save at the section's end | section nav becomes the tab row; sections stack |
| `FormDialog`    | title, minimum fields, footer: Cancel (ghost) + Create (primary); on success, navigate to the new entity | the stock dialog at full width minus the gutter; scrolls inside |
| `ConfirmDialog` | "Delete course «X»?", consequence in one sentence, Cancel + destructive verb; focus starts on Cancel | same, full width |

- Tables switch to `DataList` with a container query (`@container`), not a viewport breakpoint. No page at 390 px
  scrolls horizontally (e2e fixture).
- A row that opens one thing is a target as a whole: its main link stretches over the row (`Link variant="stretched"`,
  a column's `stretch: true` in `DataTable`); other controls in it sit above (`relative z-1`). Row checkboxes appear only
  after «Выбрать несколько» (`SelectToggle`), so a click on a row never toggles a selection by accident.
- A filter applies on pick; no «Применить» button. The teacher inbox shows its filters only past ten items.
- Editors (block editor, code-test builder) are the only screens allowed to show a "desktop only" state.

## 7. Data states

Every data region renders exactly one of the kit's four states:

1. Loading: a skeleton of the final layout (`bg-muted`, static); no page spinner, `animate-spin` only in a button.
2. Empty: one sentence on what will appear here, plus the create action when the user is allowed to create.
3. No matches: shown when a filter is in the URL. One sentence plus a "Reset filters" action.
4. Error / no access: the `ApiError` message from the code map plus "Retry"; a 403 is shown in place, same URL.

## 8. Kit: shadcn base-nova + our composites

- `src/shared/ui/` started as shadcn (`components.json`, `base-nova` on Base UI; how to add: `apps/web-2/AGENTS.md`) and is
  restyled in place to the house look (control height, radius, table typesetting). A kit file is edited for a look every
  screen shares, never for one screen.
- `src/shared/components/` is ours, under every lint and token rule: templates, form fields (`useAppForm`), data
  regions, `IconButton`, `StatusBadge`, `ErrorAlert`, `SheetPanel`, menus. A look the stock kit lacks (status
  tones, link looks, a dialog width) is a variant there; features pass layout classes only, never restyle.
- Features use stock props (`variant`, `size`, `render`); a link that looks like a button and the pending state:
  AGENTS.md "Button looks"; the spinner sits `data-icon="inline-start"`.

## 9. Component rules

- One primary button per view: one in a template header and one in each dialog footer. Everything else is
  secondary, outline or ghost.
- Every destructive action goes through `ConfirmDialog` with the object's name. The `destructive` button variant
  appears only in that dialog and in a settings "danger zone" that opens it.
- Create = `FormDialog`, then navigate to the entity's workspace. Edit = a page. Each object has one edit place
  and one review place.
- Tabs are route links (`<Link>`); the label and the URL segment are the same word. No tabs in component state.
- Icons are lucide named imports, `size-4` next to `text-sm`, `size-5` next to `text-base`, only when they carry
  meaning (type, status, a known action). Icon-only buttons have an `aria-label` and a tooltip.
- A toast appears only from a mutation's `onSuccess` (wording: section 11). Errors stay on the page: inline, under
  the field or in the region.
- Status badges: an exhaustive `Record<Status, {label, token}>`; a list's usual state is quiet text, a badge the exception.
- A card is one object you could pick up; sections are split by headings, hairlines and spacing. A course on a list is its
  picture with the title set under it, and the whole of it opens the course. Dashboard numbers: `KpiStrip` of `KpiTile`s, not cards. No tinted icon tiles: an icon stands on the paper.

## 10. Motion and focus

- Our code: only `transition-colors|opacity|transform`, `duration-100|150|200` (or `--duration-*`); motion only for
  overlays, accordions, a rotating chevron and progress. No hover scale, translate, bounce, pulse or entrance animation. Stock overlays animate with tw-animate-css. Reduced motion zeroes every duration (tokens.css).
- Focus: the global `:focus-visible` outline in `ring` (2 px, offset 2 px); stock controls draw their own `ring`.
  Never `outline-none` without an equal replacement. Focus order follows visual order.

## 11. Writing tone (ru / kk / en)

- Buttons: a short verb in sentence case, no "please", no "!": «Сохранить» / «Сақтау» / "Save". The toast repeats
  it in the past tense: «Сохранено» / «Сақталды» / "Saved".
- Errors say what happened and what to do next, never apologize or blame: «Файл больше 50 МБ. Выберите файл поменьше.»
- Formal «вы» (ru, lowercase) and «сіз» (kk); en: American spelling, curly quotes. Confirmations name the object and
  the consequence; empty states invite one action. Terms: `messages/glossary.json` (G-03); dates, numbers: format module.

## 12. Never

- ornament and patterns, serif or italic display type, paper-book skeuomorphism, a title printed on a cover, dashed or stitched lines as decoration
- gradients outside uploads, glass/blur, tinted icon tiles, eyebrow labels over every heading, a three-up grid of icons with blurbs, decorative icons (`Sparkles`, `Rocket`, `Zap`, `PartyPopper`, `Wand2`; `Flame` = a streak)
- cards inside cards, a second primary button, a delete without confirmation; color as the only signal
- all-caps labels, letter-spacing, `font-bold`, sizes outside the table above; animations > 200 ms, hover scale or lift
- horizontal scroll at 390 px; "desktop only" outside the two editors; tabs in state; edit forms in dialogs
