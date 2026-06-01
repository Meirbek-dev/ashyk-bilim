# Course Creation Workflow Redesign Plan

## Scope

Rewrite the new course creation page at `/ru/dash/courses/new` and tighten the surrounding course creation workflow. The goal is a restrained course-authoring interface that feels designed for repeated admin work: no gradients, no decorative motion, no scaling hover tricks, no loud status colors, no fake wizard language, and no wasted canvas.

This plan is based on:

- Screenshot review of `http://localhost:3000/ru/dash/courses/new`.
- Code audit of `apps/web/src/components/Dashboard/Courses/CourseCreationWizard.tsx`.
- Workflow audit of the courses dashboard, workspace shell, details, curriculum, and review pages.
- Requested skill constraints: Vercel composition patterns, Vercel React best practices, Next.js App Router practices, shadcn/base-nova conventions, Web Interface Guidelines, UI/UX rules, frontend design critique, design taste audit, and stop-slop prose cleanup.
- Latest Vercel Web Interface Guidelines from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

## Design Read

Reading this as: education SaaS admin workflow for teachers and course managers, with a quiet utilitarian product language, leaning toward the existing shadcn base-nova system, semantic tokens, dense but calm layout, and near-zero motion.

Target dials:

- `DESIGN_VARIANCE: 3`
- `MOTION_INTENSITY: 1`
- `VISUAL_DENSITY: 6`

This is product UI, not a landing page. The page should prioritize scanning, form completion, error recovery, and a predictable handoff into the course workspace.

## Current State

Primary files:

- `apps/web/src/app/[locale]/(platform)/dash/courses/new/page.tsx`
- `apps/web/src/components/Dashboard/Courses/CourseCreationWizard.tsx`
- `apps/web/src/components/Dashboard/Courses/courseWorkflowUi.tsx`
- `apps/web/src/lib/course-management.ts`
- `apps/web/src/services/courses/courses.ts`
- `apps/web/src/app/_shared/dash/courses/client.tsx`
- `apps/web/src/components/Dashboard/Courses/CourseWorkspacePageShell.tsx`
- `apps/web/src/components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral.tsx`
- `apps/web/src/components/Dashboard/Pages/Course/EditCourseStructure/CurriculumEditor.tsx`
- `apps/web/src/components/Dashboard/Courses/CourseReviewPublish.tsx`

Current behavior:

- The new page renders one client component with form state, template state, source-course search, creation mutation, outline import, summary rendering, and routing.
- Required fields are title and markdown description.
- Initial visibility can be private or public.
- Template can be blank, starter, or outline from another course.
- Outline import creates the new course first, then creates chapters one by one from the source course.
- Successful creation always redirects to `/dash/courses/[uuid]/curriculum`.
- `/dash/courses/[uuid]` redirects to curriculum, so there is no real course workspace overview.

## Critical Findings

### 1. The page wastes space and weakens hierarchy

`CourseCreationWizard.tsx` wraps the page in `min-h-screen px-4 py-8 lg:px-8`, then constrains content to `max-w-5xl`. On a 1650 px wide viewport, this creates a narrow centered island with large empty gutters. The screenshot shows the left navigation, then a long blank band before the content starts.

The header is a card inside the page instead of using the dashboard `DashHeader` pattern. That makes the page look disconnected from the course dashboard and course workspace. The title card, form card, and summary card all compete for the same visual role.

Required change:

- Use `DashHeader` for the page title, breadcrumb, and cancel/back action.
- Use the main canvas for the actual setup form.
- Expand the working area to the same dashboard container rhythm as other course management pages.
- Limit cards to actual grouped form sections, not the whole page header.

### 2. It calls itself a guided setup but behaves like one long form

The copy says "Guided setup", but the UI has no step model, no progress, no current decision state, and no clear path after creation. It has only one submit action and a hidden advanced template area.

Required change:

- Stop presenting this as a wizard unless it becomes a real staged flow.
- Prefer a one-screen "Create Course" setup form with clear sections:
  - Basics
  - Starting Structure
  - Visibility
  - After Creation
- If a multi-step wizard is retained, add real steps, back/continue behavior, URL-backed step state, and a final review step.

Recommendation:

- Use a one-screen setup form. Course creation is not complex enough to justify a modal-like wizard.

### 3. The description editor is too heavy for first-run creation

The required "short description" uses the full `MarkdownEditor` with formatting toolbar, snippets, preview, link controls, and status bar. It consumes most of the first viewport and pulls attention away from the key decision: creating the workspace.

The screenshot also shows the empty editor in an error state before the user has clearly submitted the form. This makes the initial screen feel broken.

Required change:

- Use a lightweight description field by default:
  - A shadcn `Textarea` or a compact markdown textarea.
  - Optional "Format with Markdown" disclosure for preview/tools.
  - Character counter only after input starts.
- Validate required description on blur and submit, not on initial render.
- Focus the first invalid field on submit.
- Keep errors next to fields with `aria-live="polite"` or `role="alert"` where appropriate.

### 4. The template picker is hidden behind weak progressive disclosure

`showAdvancedOptions` defaults to false. The page headline tells the user they can start with a blank course, starter template, or another course, but only blank/private choices are visible initially. The user has to discover the template section.

Required change:

- Make "Starting Structure" visible by default.
- Use a compact segmented control or a dense three-row choice group:
  - Blank
  - Starter Outline
  - Copy Outline
- Show only the selected option's detail panel.
- Keep the source-course search visible only for "Copy Outline".

### 5. The source-course search is a custom combobox without combobox behavior

The source-course selector uses an input plus a manually rendered list of buttons. Search errors are swallowed, empty results are not explained, and in-flight requests are not cancelled. Keyboard behavior, active option state, and selected option semantics are not obvious.

Required change:

- Replace the custom search list with the existing shadcn/base `Combobox` or `Command` composition.
- Add loading, empty, selected, and error states.
- Use `AbortController` or request sequencing to ignore stale results.
- Surface "No courses found" and "Unable to load courses" inline.
- Preserve the selected source course even if the query changes.

### 6. The creation mutation mixes too many responsibilities

`CourseCreationWizard.tsx` directly handles form state, source search, course creation, source metadata fetch, chapter creation, toast copy, and redirects. `createOutlineFromSource` creates chapters serially after course creation. If chapter import fails halfway, the user receives a generic error but may already have a partially created course.

Required change:

- Move course creation orchestration into a dedicated mutation layer.
- Treat "create course with outline" as one domain operation from the UI's perspective.
- Return a typed result with:
  - created course uuid
  - imported chapter count
  - warnings, if any
  - destination route
- Use a server action or a typed service function that owns the transaction-like behavior.
- If the backend cannot make this atomic, show partial-success recovery: "Course created, 3 of 5 chapters imported. Open course or retry import."

### 7. The workflow creates a readiness mismatch

The wizard collects title, description, visibility, and optional structure. The details page later requires additional fields such as learning outcomes, tags, thumbnail type, and media. The review page readiness model expects details, media, curriculum, collaboration, access, and certificate. Creation redirects to curriculum, skipping details and media, so a new course lands in a workspace that immediately reports missing setup.

Required change:

- Add a real workspace overview at `/dash/courses/[uuid]` instead of redirecting to curriculum.
- After creation, land on the overview by default.
- The overview should show a focused "Next 3 tasks" checklist:
  - Add or confirm course details
  - Build curriculum
  - Review access and publish
- Let advanced users choose "Open Curriculum" from the create form, but make overview the default.

### 8. Visibility copy is conceptually muddy

The current form lets the creator choose "Public" during creation, while the workflow also has a "Review & Publish" page. This creates two competing launch concepts.

Required change:

- Rename the field to "Initial Visibility" if it remains on create.
- Default to private.
- Make public creation explicit: "Visible after creation. You can still review content before sharing the link."
- Prefer creating all new courses as private, then publishing only from the review page.

Recommendation:

- Remove public as a primary creation decision. Put "Initial Visibility" in a lower-priority settings row, default private, with a clear warning if public is selected.

### 9. The summary card repeats form values instead of guiding decisions

The summary card says title, visibility, and template. It does not explain whether the form can be submitted, what will happen next, or why the create button is disabled.

Required change:

- Replace "Setup Summary" with a "Creation Result" or "Next Step" panel.
- Show:
  - Required fields complete count
  - Starting structure outcome
  - Initial visibility
  - Destination after create
  - Disabled-submit reasons
- On mobile, do not hide this behind a collapsible by default. Show it as an inline pre-submit review after the form sections or use a sticky bottom action with reason text.

### 10. The visual language has too many ornamental product-UI habits

Current UI uses many rounded `xl`/`2xl` shells, shadows, uppercase micro-labels, selected icon tiles, and status colors. It is not egregious, but it reads like assembled component blocks rather than a single authored workflow.

Required change:

- Use one radius rule:
  - panels: `rounded-lg`
  - inputs/buttons: existing component radius
  - no `rounded-2xl` on admin work surfaces
- Replace most shadows with borders and spacing.
- Use one accent: existing `primary`.
- Use semantic status tokens. Avoid hardcoded emerald/amber in workflow badges.
- Remove `transition-all`; list `border-color`, `background-color`, `color`, and `opacity` only.
- Do not animate scale or position on selection or hover.

### 11. Accessibility gaps need a pass before redesign ships

Risks found in the current flow:

- Disabled create button gives no reason.
- Source search has no full combobox semantics.
- Empty editor can appear invalid on first paint.
- No focus management for submit errors.
- Some icon usage lacks `aria-hidden`.
- Date formatting elsewhere in course dashboard uses `toLocaleDateString()` without an explicit locale.
- Some raw `fieldset` usage should move to local `FieldSet` and `FieldLegend` patterns where available.

Required change:

- Add visible validation messages tied to controls.
- Keep submit enabled until request starts only if submit can reveal field errors. If disabled before submit, show a reason.
- Add keyboard test coverage for template selection and source course selection.
- Use `Intl.DateTimeFormat` for course dashboard dates when touching the course workflow.

### 12. Component architecture works against reuse

`CourseCreationWizard.tsx` is a large client component. It re-renders for every watched field and owns unrelated concerns. `courseWorkflowUi.tsx` contains shared badge/card primitives with page-specific color decisions.

Required change:

- Move creation-specific code under `features/courses/create`.
- Split state and view:
  - `CourseCreatePageShell` as a server component.
  - `CourseCreateForm` as the client form island.
  - `useCourseCreateForm` for form defaults, validation, and derived state.
  - `useSourceCourseSearch` for debounced/cancellable source search.
  - `useCreateCourseMutation` for creation orchestration.
  - Presentational section components for basics, structure, visibility, and destination.
- Keep shared workflow badges neutral and token-driven.

## Target UX

### Entry points

Courses dashboard:

- Primary action: "New Course".
- Secondary row action: "Use as Starting Point".
- Preserve `buildCourseCreationPath(sourceCourseUuid)` for template deep links, but rename query semantics if needed:
  - `?start=outline&source=[uuid]`

New course page:

- Header: dashboard breadcrumb, title "Create Course", short description, cancel action.
- Main content: two-column grid on desktop, single column on mobile.
- Primary action: "Create Course".
- Secondary action: "Cancel".
- Optional destination select: "Open Overview" default, "Open Curriculum" secondary.

Post-create:

- Success toast: "Course created."
- Redirect to `/dash/courses/[uuid]` overview by default.
- Overview gives the first useful action instead of dropping the creator into a blank curriculum editor.

### Page layout

Desktop target:

```text
DashHeader
--------------------------------------------------------------------------------
Create Course                                      Cancel
Set the title, starting structure, and first workspace destination.

Main container max 1280
--------------------------------------------------------------------------------
Left: form, 760 px max                    Right: sticky review, 360 px

[Basics]                                  [Ready To Create]
Title                                     Required fields complete
Description                               Structure outcome
                                          Visibility
[Starting Structure]                      Destination
Blank | Starter | Copy Outline
Selected option panel                     [Create Course]

[Visibility]
Private default
Public optional

[After Creation]
Open Overview default
Open Curriculum optional
```

Mobile target:

- One column.
- Header stays normal, no nested page card.
- Sections stack in the same order.
- Summary becomes a final "Review & Create" section.
- Submit actions sit in a sticky bottom bar only if it does not cover field errors.

### Section behavior

Basics:

- Course title is first and autofocused only on desktop.
- Description starts as a compact required field.
- Helper text explains the public-facing purpose.
- Errors appear after blur or submit.

Starting Structure:

- Visible by default.
- Use `ToggleGroup` or `RadioGroup` with compact rows.
- Blank: no extra fields.
- Starter: show exact chapters that will be created.
- Copy Outline: show combobox and a small import summary:
  - "Copies chapter titles only."
  - "Activities and content stay in the source course."

Visibility:

- Default private.
- Public is available only if product policy supports immediate public creation.
- Public selection shows a neutral warning panel, not a bright warning card.

After Creation:

- Default "Open Overview".
- Secondary "Open Curriculum" for users who know they want to build structure immediately.
- Store choice in URL query only if deep linking is useful.

Summary:

- Show derived state, not duplicate labels.
- If create is blocked, show the first blocking reason:
  - "Add a course title."
  - "Add a short description."
  - "Select a source course."

## Target Visual System

Use existing shadcn/base-nova. Do not introduce a second design system.

Rules:

- Use semantic tokens only: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-destructive`.
- No gradients.
- No decorative backgrounds.
- No `transition-all`.
- No transform or scale hover effects.
- No oversized hero typography.
- No nested cards.
- No centered marketing layout.
- Cards only for form sections or the sticky review panel.
- Prefer `rounded-lg` for admin panels.
- Keep body text at 14-16 px, labels at 14 px, helper text at 13-14 px.
- Use `gap-*`, not `space-y-*`, when touching shadcn-governed UI.
- Keep all controls at least 44 px high on touch viewports.

Status colors:

- Use destructive only for errors.
- Use muted/foreground for neutral states.
- Use primary only for current selection and primary action.
- Move success/warning badge colors into named semantic status variants if the workflow needs them.

## Proposed Component Architecture

New files:

- `apps/web/src/features/courses/create/CourseCreatePage.tsx`
- `apps/web/src/features/courses/create/CourseCreateForm.tsx`
- `apps/web/src/features/courses/create/CourseCreateSections.tsx`
- `apps/web/src/features/courses/create/CourseCreateReviewPanel.tsx`
- `apps/web/src/features/courses/create/SourceCourseCombobox.tsx`
- `apps/web/src/features/courses/create/useCourseCreateForm.ts`
- `apps/web/src/features/courses/create/useSourceCourseSearch.ts`
- `apps/web/src/features/courses/create/useCreateCourseMutation.ts`
- `apps/web/src/features/courses/create/course-create-types.ts`
- `apps/web/src/features/courses/create/course-create-copy.ts` if copy mapping grows too large for messages

Route file:

- Keep `apps/web/src/app/[locale]/(platform)/dash/courses/new/page.tsx` as a thin server entry.
- It should render `CourseCreatePage`.

Server and service layer:

- Add a typed creation orchestration function near course services.
- Prefer a server action if auth and cache invalidation behavior is cleaner there.
- Keep `createNewCourse` as the low-level API call.
- Add `createCourseWorkspace` as the UI-facing operation:
  - validates payload
  - creates course
  - seeds starter chapters or copied outline
  - revalidates cache tags once
  - returns typed result

Shared UI:

- Keep `CourseStatusBadge` if needed, but remove hardcoded emerald/amber classes from shared workflow primitives.
- Add a neutral `CourseWorkflowPanel` only if it removes repeated class strings across workflow pages.
- Use shadcn `FieldGroup`, `Field`, `FieldSet`, `FieldLegend`, `FieldDescription`, `FieldError`.
- Use shadcn `ToggleGroup` for template selection if it remains 3 choices. Use `RadioGroup` if the choices need long descriptions.
- Use `Combobox` or `Command` for source-course selection.

Composition rules:

- No boolean-prop pileups for section variants.
- Use explicit components:
  - `BlankStructureOption`
  - `StarterStructureOption`
  - `CopyOutlineStructureOption`
- Put form state in a provider or hook only if sibling sections need shared derived state.
- Keep the provider as the only place that knows how state is stored.

## Data Model Changes

Current schema:

```ts
name: string
description: string
public: boolean
template: 'blank' | 'starter' | 'outline'
sourceCourseUuid?: string
```

Proposed schema:

```ts
title: string
description: string
structureMode: 'blank' | 'starter' | 'copy-outline'
sourceCourseUuid?: string
initialVisibility: 'private' | 'public'
destination: 'overview' | 'curriculum'
```

Mapping:

- `title` maps to API `name`.
- `description` maps to API `description`.
- `initialVisibility` maps to API `visibility` only if public-at-create remains supported.
- `structureMode: starter` maps to backend template if backend supports it. If not, create chapters in the orchestration function.
- `structureMode: copy-outline` requires `sourceCourseUuid`.

Validation:

- Title required, max 100.
- Description required, max 8000, but UI should suggest a shorter target.
- Source course required only for copy outline.
- Destination required.
- Public creation may require confirmation depending on product policy.

## Implementation Plan

### Phase 1: Audit and stabilize behavior

Tasks:

- Capture screenshots at 375, 768, 1280, and 1650 px for the current page.
- Record current keyboard flow:
  - title
  - description
  - visibility choices
  - template disclosure
  - source search
  - create
- Confirm backend behavior for `template: 'starter'`.
- Confirm whether course creation can be public safely.
- Confirm whether outline import should copy only chapters or also descriptions.
- Decide whether a new course should land on overview or curriculum.

Acceptance:

- Product decisions above are documented before code rewrite starts.
- Existing e2e course creation test still passes before refactor.

### Phase 2: Create the new feature module

Tasks:

- Add `features/courses/create` module.
- Move form defaults, derived state, and validation out of `CourseCreationWizard`.
- Add typed payload and result types.
- Add `useSourceCourseSearch` with:
  - debounce
  - stale response protection
  - loading state
  - empty state
  - error state
- Add `useCreateCourseMutation` with:
  - pending state
  - typed success result
  - typed partial-success result
  - error mapping

Acceptance:

- `CourseCreationWizard.tsx` can be replaced or reduced to a compatibility wrapper.
- UI sections can be tested without creating a course.

### Phase 3: Rewrite the UI layout

Tasks:

- Replace the page-level header card with `DashHeader`.
- Build the desktop grid:
  - main form column
  - sticky review panel
- Build mobile layout:
  - stacked sections
  - final review section
  - no hidden summary by default
- Replace hidden advanced template disclosure with visible "Starting Structure".
- Replace full markdown editor with compact description input.
- Add optional markdown/preview expansion only if needed.
- Add explicit disabled-submit reason.

Acceptance:

- No gradients.
- No `transition-all`.
- No transform or scale interactions.
- No nested cards.
- No card header used as page header.
- Page uses dashboard width better on 1440 and 1650 px screens.
- Long Russian labels wrap without overlapping controls.

### Phase 4: Fix source-course selection

Tasks:

- Replace the custom input/list with shadcn `Combobox` or `Command`.
- Add keyboard navigation and selected state.
- Add loading, empty, and error states.
- Preserve query params from "Use as Starting Point".
- If `src` is provided, resolve and show the course name.

Acceptance:

- User can complete copy-outline flow with keyboard only.
- Stale search responses cannot overwrite newer results.
- Empty and error states are visible inline.

### Phase 5: Refactor creation orchestration

Tasks:

- Add `createCourseWorkspace` operation.
- Move outline/starter creation out of the component.
- Use `Promise.allSettled` or backend transaction support for chapter seeding.
- Return partial success if some chapters fail.
- Revalidate course list and detail tags once per creation flow.
- Keep `createNewCourse` as a low-level API function.

Acceptance:

- Component no longer imports `getCourseMetadata` or `createChapter`.
- UI receives one typed result and one error shape.
- Partial failures give the user a recovery path.

### Phase 6: Add workspace overview

Tasks:

- Replace `/dash/courses/[courseuuid]` redirect with a real overview page.
- Reuse the readiness checklist logic, but present it as task cards:
  - Details
  - Curriculum
  - Access
  - Review & Publish
- Show the first recommended action after creation.
- Keep curriculum available as the second tab/action.

Acceptance:

- New course default redirect lands on overview.
- Users see why the course is not publish-ready.
- The overview uses the same chrome as workspace pages.

### Phase 7: Align the courses dashboard entry points

Tasks:

- Rename "Guided setup" to "New Course" or "Create Course".
- Keep "Use as Template" but clarify it copies structure only.
- Update empty state CTA copy to match the new flow.
- Preserve query-driven filters and view state.

Acceptance:

- Dashboard, new course page, and workspace use the same vocabulary.
- "Template", "outline", and "starter" are not used interchangeably.

### Phase 8: Update copy and translations

Tasks:

- Replace jargon:
  - "workspace" only where the product truly means workspace
  - "audience posture" with direct language
  - "launch target" with "initial visibility"
  - "borrow" with "copy outline"
- Use direct button labels:
  - "Create Course"
  - "Create & Open Overview"
  - "Create & Open Curriculum"
- Update `en-US`, `ru-RU`, and `kk-KZ`.
- Check Russian strings in the browser, not through a mojibake-prone terminal.

Acceptance:

- Copy explains outcomes, not internal implementation.
- Buttons say what happens after click.
- Validation messages include the fix.

### Phase 9: Tests and verification

Unit and integration tests:

- Add tests for schema validation:
  - blank title
  - blank description
  - copy-outline without source
  - public visibility if policy requires confirmation
- Add tests for derived submit state.
- Add tests for `useSourceCourseSearch` stale response handling.
- Add tests for creation result mapping.

E2E tests:

- Update `CourseCreatePage` page object.
- Add happy path:
  - create blank private course
  - redirect to overview
- Add starter path:
  - create starter course
  - verify starter chapters appear
- Add copy-outline path:
  - select source course
  - verify copied chapters
- Add validation path:
  - submit empty form
  - focus lands on first invalid field
  - disabled or blocked reason is visible

Visual and accessibility checks:

- Desktop: 1280 and 1650 px.
- Tablet: 768 px.
- Mobile: 375 px.
- Keyboard-only completion.
- Reduced motion mode.
- Dark mode.
- Russian locale.
- Long title and long source course name.
- Empty source search.
- Slow source search.
- Creation error.
- Partial outline import error.

Commands:

```bash
bun run --cwd apps/web check-types
bun run --cwd apps/web lint
bun run --cwd apps/web test
bun run --cwd apps/web test:e2e -- 03-course-creation.spec.ts
```

## Proposed File-Level Changes

### Replace

- `apps/web/src/components/Dashboard/Courses/CourseCreationWizard.tsx`
  - Replace with small wrapper or delete after route migration.

### Add

- `apps/web/src/features/courses/create/CourseCreatePage.tsx`
- `apps/web/src/features/courses/create/CourseCreateForm.tsx`
- `apps/web/src/features/courses/create/CourseCreateSections.tsx`
- `apps/web/src/features/courses/create/CourseCreateReviewPanel.tsx`
- `apps/web/src/features/courses/create/SourceCourseCombobox.tsx`
- `apps/web/src/features/courses/create/useCourseCreateForm.ts`
- `apps/web/src/features/courses/create/useSourceCourseSearch.ts`
- `apps/web/src/features/courses/create/useCreateCourseMutation.ts`
- `apps/web/src/features/courses/create/course-create-types.ts`
- `apps/web/src/features/courses/create/index.ts`

### Modify

- `apps/web/src/app/[locale]/(platform)/dash/courses/new/page.tsx`
  - Render the new server page shell.
- `apps/web/src/app/[locale]/(platform)/dash/courses/[courseuuid]/page.tsx`
  - Replace redirect with overview.
- `apps/web/src/services/courses/courses.ts`
  - Add typed create workspace orchestration or keep low-level API only and move orchestration to a server action.
- `apps/web/src/lib/course-management.ts`
  - Add route helpers for create destination and real overview.
- `apps/web/src/components/Dashboard/Courses/courseWorkflowUi.tsx`
  - Remove hardcoded success/warning palette decisions or move them behind semantic variants.
- `apps/web/src/app/_shared/dash/courses/client.tsx`
  - Update entry point copy and row action copy.
- `apps/web/src/messages/en-US.json`
- `apps/web/src/messages/ru-RU.json`
- `apps/web/src/messages/kk-KZ.json`
- `apps/web/e2e/page-objects/CourseCreatePage.ts`
- `apps/web/e2e/specs/03-course-creation.spec.ts`

## Non-Goals

- Do not redesign the whole dashboard sidebar.
- Do not replace shadcn/base-nova.
- Do not add a new animation library.
- Do not change public course player routes.
- Do not change backend course schema unless atomic creation requires a small API addition.
- Do not copy course activities/content in the outline mode unless product explicitly requests it.

## Risks

1. Backend template behavior may not match UI copy.
   - Mitigation: confirm whether `template: 'starter'` creates chapters server-side. If not, move starter seeding into the new orchestration function.

2. Public-at-create may bypass review expectations.
   - Mitigation: default to private and move publish intent to review.

3. Outline import can leave partial data.
   - Mitigation: backend transaction preferred. Otherwise report partial success and offer retry.

4. Moving to overview changes existing e2e assumptions.
   - Mitigation: update tests and preserve an "Open Curriculum" destination option.

5. Compact description input may reduce formatting access.
   - Mitigation: keep optional markdown expansion or open full editor after creation on details page.

## Definition Of Done

- New course page uses dashboard chrome and fills desktop space coherently.
- Creation flow is understandable without hidden advanced settings.
- First paint has no premature validation errors.
- Create action explains why it is blocked.
- Source-course selection is a real accessible combobox.
- Course creation orchestration is typed and recoverable.
- New courses land on a useful overview by default.
- Copy is direct in English, Russian, and Kazakh.
- No gradients, no decorative motion, no scaling, no `transition-all`, no odd accent colors.
- The full creation e2e flow passes.
- Manual screenshots pass at 375, 768, 1280, and 1650 px in light and dark mode.
