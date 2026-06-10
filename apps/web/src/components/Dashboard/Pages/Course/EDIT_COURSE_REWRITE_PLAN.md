# EditCourse Rewrite, Redesign, and Refactor Plan

## Scope

This plan covers the `EditCourse*` course workspace pages in `apps/web/src/components/Dashboard/Pages/Course`:

- `EditCourseGeneral`
- `EditCourseAccess`
- `EditCourseContributors`
- `EditCourseStructure`
- `EditCourseCertification`
- `ConflictResolutionModal`

Skill lenses used: Vercel composition patterns, Vercel React performance guidance, Next.js best practices, Next 16 Cache Components, shadcn/ui rules, Web Interface Guidelines, UI/UX Pro Max, Frontend Design, Design Taste Frontend, and Stop Slop. `design-taste-frontend` explicitly excludes dashboards and dense product UI, so its useful parts here are audit-first redesign discipline, anti-default visual checks, and preservation rules.

Design read: operational course authoring UI for teachers and platform admins, with a quiet, information-dense shadcn work-surface language. The redesign should feel like a reliable LMS editor, not a marketing page.

## Executive Summary

The current pages work, but they concentrate too much behavior inside route-level client components. `EditCourseCertification.tsx` is about 600 lines and mixes form schema creation, hydration, certification CRUD, preview state, and view layout. `EditCourseContributors.tsx` is about 750 lines and owns search, staged policy changes, bulk selection, conflict retry, role/status mutations, table rendering, and popover UI in one component. `CurriculumEditor.tsx` mixes DnD orchestration, chapter creation, structure persistence, and rendering.

The rewrite should keep the existing course workspace shell, query keys, mutation hooks, dirty guard, and optimistic editor bundle patterns. The refactor should introduce section controllers and small presentational components, normalize staged vs immediate actions, and redesign the UI around a consistent editor section system.

The biggest risks are data loss during dirty-state hydration, conflict handling regressions, keyboard accessibility in DnD and tables, and accidental cache invalidation gaps between TanStack Query and Next cache tags.

## Critical Findings

### 1. Client Boundaries Are Too Broad

Every page in the target folder starts as a client component. That is appropriate for form islands, DnD, file upload, and popovers, but it makes whole page sections hydrate even when only a small part needs browser state.

Evidence:

- `EditCourseGeneral.tsx` starts with `'use client'` and contains form setup, media section, markdown editor, and all rendering in one file.
- `EditCourseCertification.tsx` starts with `'use client'` and owns the full certificate editor plus live preview.
- `CourseWorkspacePageShell.tsx` is also client-side and wraps all tabs, dirty guard, conflict alert, and children.

Plan:

- Keep `CourseWorkspacePageShell` as the shared client editor chrome for now.
- Move pure derivations and schema builders into non-React modules.
- Split each section into a small client controller plus presentational subcomponents.
- Lazy-load heavy leaves such as `MarkdownEditor`, `EmojiPicker`, certificate preview QR generation, and activity creation modals.

### 2. Dirty State Is Inconsistent

`EditCourseGeneral` and `EditCourseCertification` use React Hook Form dirty tracking. `EditCourseAccess` and `EditCourseContributors` use ad hoc `useRef` dirty checks against local booleans. This creates multiple mental models for save/discard behavior.

Evidence:

- `EditCourseGeneral.tsx` uses `form.formState.isDirty` and `useSyncDirtySection`.
- `EditCourseAccess.tsx` calculates `isDirtyRef.current = draftPublic !== undefined && draftPublic !== courseStructure?.public`.
- `EditCourseContributors.tsx` repeats that ref pattern for `open_to_contributors`.

Plan:

- Create `useCourseSectionDraft<T>()` for simple staged values.
- Create `useCourseSectionForm<T>()` for RHF sections.
- Expose a uniform return shape: `draft`, `isDirty`, `isSaving`, `save`, `discard`, `error`, `serverVersion`.
- Keep `useSyncDirtySection` as the single bridge into the global dirty map.

### 3. Staged and Immediate Actions Are Mixed Without a Strong Contract

Access policy, contributor openness, general details, and certification are staged. User group links, contributor roster edits, thumbnail upload, activity CRUD, publishing, and curriculum ordering apply immediately. The UI uses alerts to explain this, but the code does not encode the distinction.

Evidence:

- `EditCourseAccess.tsx` stages `public`, then links/unlinks user groups immediately.
- `EditCourseContributors.tsx` stages `open_to_contributors`, then immediately adds, removes, and edits roster entries.
- `ThumbnailUpdate.tsx` uploads immediately inside the General tab.
- `CurriculumEditor.tsx` saves order immediately on drag end.

Plan:

- Define two command types:
  - `staged`: participates in dirty guard and section save bar.
  - `immediate`: disables only its own control, shows local progress, and refreshes/invalidate relevant editor data.
- Use visible section labels: "Saved with this section" and "Applies immediately" as compact `Alert` or `Badge` treatments, not long repeated paragraphs.
- Make immediate actions use a shared `useImmediateCourseAction` wrapper for toast, conflict, refresh mode, and disabled state.

### 4. shadcn Composition Is Uneven

The pages use shadcn primitives, but several patterns bypass the project rules.

Evidence:

- Many layouts use `space-y-*`, while the shadcn skill asks for `flex flex-col gap-*`.
- `EditCourseCertification.tsx` uses emoji as structural certificate pattern icons.
- `ActivityElement.tsx` creates custom status spans and activity color classes instead of semantic badges.
- `EditCourseContributors.tsx` uses fixed-width dropdown buttons and a horizontally dense table that will struggle on small screens.
- `ThumbnailUpdate.tsx` nests a card inside the General page media card.

Plan:

- Introduce editor primitives:
  - `CourseEditorSection`
  - `CourseEditorSectionHeader`
  - `CourseEditorSaveBar`
  - `CourseEditorNotice`
  - `CourseEditorEmpty`
  - `CourseEditorInlineActions`
- Use shadcn `FieldGroup`, `Field`, `FieldSet`, `FieldLegend`, `Badge`, `Empty`, `Skeleton`, `Alert`, `Separator`, `Tabs`, `Table`, `ScrollArea`, `Dialog`, `AlertDialog`, `Command`, and `Popover`.
- Replace emoji certificate pattern icons with lucide icons or small token swatches.
- Replace raw status spans with `CourseWorkflowBadge` or shadcn `Badge` variants.
- Avoid nested cards. Use one section card and inner panels with borders or bands.

### 5. Accessibility Needs a Pass Before Visual Redesign

The current pages contain several accessible choices, such as DnD announcements and dialog titles. The custom controls still need work.

Evidence:

- `ActivityElement.tsx` uses a `div` as the drag handle with DnD listeners and no role or label.
- `EditCourseContributors.tsx` uses clickable table rows for selection, while the row itself is not a semantic button.
- Contributor table checkboxes lack explicit row labels.
- `LearningItemsList.tsx` uses icon buttons, but also removes the focus ring from the main input with `focus-visible:ring-0`.
- `LearningItemsList.tsx` scrolls with `behavior: 'smooth'` and does not check reduced-motion preferences.
- `EditCourseGeneral.tsx` has `aria-labelledby="course-edit-title"` but no visible element with that id in the file.

Plan:

- Make drag handles actual `Button` or `button` elements with `aria-label`, `aria-describedby`, and keyboard instructions.
- Keep row selection on checkboxes and add a row-level button only if keyboard behavior is implemented.
- Add `aria-label` or labelled text for all table checkboxes.
- Use `focus-visible:ring-*` instead of removing focus indicators.
- Respect `prefers-reduced-motion` for smooth scrolling and animated upload indicators.
- Fix broken ARIA references.

### 6. Performance and Bundle Issues

The pages include heavy interactive components and large controlled structures.

Evidence:

- `LearningItemsList.tsx` serializes the full learning item array into JSON on every text change.
- `EditCourseContributors.tsx` maps all contributors into a table inside a scroll area without virtualization.
- `CertificatePreview.tsx` generates a QR code on mount even when no real certificate id or QR link exists.
- `EditCourseContributors.tsx` mutates fetched search results via `Object.assign(user, ...)`.
- `ThumbnailUpdate.tsx` validates and uploads the file immediately after selection, leaving no review step.

Plan:

- Store learning items as structured state in RHF and serialize only at save boundaries.
- Virtualize contributor and curriculum lists once row counts can exceed 50.
- Generate certificate QR codes only when `certificateId` or `qrCodeLink` exists. Use a placeholder QR icon for drafts.
- Do not mutate query data. Map to new objects.
- Add a media review state: selected, validated, previewed, upload confirmed. Keep immediate upload only if product requirements demand it.

### 7. The Visual Model Needs One Shared Editor System

The pages currently read as related but not fully designed as a single editor. Some sections use headers inside cards, some outside. Alerts repeat the same purpose. Action bars appear in different places. Dense controls compete with explanatory text.

Plan:

- Use one page rhythm:
  - page-level title and tab chrome from `CourseWorkspacePageShell`
  - section card with header, dirty badge, and actions
  - compact policy notice
  - content split into labelled groups
  - sticky save bar for dirty sections on desktop and mobile bottom bar when needed
- Use neutral surfaces, semantic tokens, and one accent: project primary.
- Keep cards at 8px radius or the existing shadcn radius.
- Use icon buttons for compact actions, with tooltips and accessible labels.
- Use tables only for desktop roster management. Switch to stacked rows or a responsive list on narrow viewports.

## Target Architecture

Move feature code out of the shared dashboard folder over time:

```text
apps/web/src/features/courses/editor/
  components/
    CourseEditorSection.tsx
    CourseEditorSaveBar.tsx
    CourseEditorNotice.tsx
    PolicyChoiceGroup.tsx
    ImmediateActionAlert.tsx
  general/
    GeneralSection.tsx
    GeneralForm.tsx
    LearningOutcomesField.tsx
    ThumbnailManager.tsx
    general.schema.ts
    general.mappers.ts
  access/
    AccessSection.tsx
    UserGroupsPanel.tsx
    useAccessDraft.ts
  contributors/
    ContributorsSection.tsx
    ContributorSearchCombobox.tsx
    ContributorRosterTable.tsx
    ContributorBulkActions.tsx
    contributor.types.ts
    contributor.mappers.ts
  curriculum/
    CurriculumSection.tsx
    CurriculumTree.tsx
    ChapterRow.tsx
    ActivityRow.tsx
    ActivityCreateDialog.tsx
    useCurriculumDnd.ts
  certification/
    CertificationSection.tsx
    CertificationForm.tsx
    CertificatePatternPicker.tsx
    CertificatePreview.tsx
    certification.schema.ts
    certification.mappers.ts
  hooks/
    useCourseSectionDraft.ts
    useCourseSectionForm.ts
    useImmediateCourseAction.ts
    useCourseConflictRetry.ts
```

Keep compatibility wrappers in the current folder during migration:

```tsx
export { GeneralSection as default } from '@/features/courses/editor/general/GeneralSection'
```

## Page-by-Page Rewrite Plan

### EditCourseGeneral

Current strengths:

- Uses RHF with Valibot.
- Uses `useSaveSection` and dirty tracking.
- Uses `next/image` for thumbnail previews.

Problems to fix:

- `initializeLearnings` stores structured learning outcomes as a JSON string.
- The default learning icon is an emoji.
- The media uploader is an immediate action nested inside a staged metadata form.
- Loading state uses custom pulse markup instead of `Skeleton` or `Spinner`.
- The ARIA label target for `course-edit-title` is missing.

Rewrite:

- Split into `GeneralSection`, `GeneralDetailsForm`, `LearningOutcomesField`, and `ThumbnailManager`.
- Convert `learnings` to a structured field array with stable ids.
- Serialize legacy JSON only in mapper functions.
- Move thumbnail upload into its own `CourseEditorSection` marked as immediate.
- Lazy-load `MarkdownEditor`.

### EditCourseAccess

Current strengths:

- Separates course visibility from linked user groups.
- Uses confirmation before unlinking groups.

Problems to fix:

- Uses custom dirty refs instead of a shared staged draft hook.
- User group table has no empty state when private course has zero groups.
- `UserGroupsSection` reaches into `useCourse`, which makes it harder to test.
- Link and unlink actions refresh editor data manually and should use a shared immediate action wrapper.

Rewrite:

- Create `AccessPolicySection` for staged public/private state.
- Create `UserGroupsPanel` for immediate group linking.
- Pass `courseUuid`, `groups`, and action callbacks as props.
- Add loading, empty, and error states with shadcn `Skeleton`, `Empty`, and `Alert`.

### EditCourseContributors

Current strengths:

- Covers search, bulk add, role/status edits, bulk remove, and conflict retry.
- Uses debounced search and confirmation for destructive bulk removal.

Problems to fix:

- The component owns too many states and handlers.
- Search result mapping mutates query data.
- Roster table selection uses clickable rows without keyboard parity.
- Role and status dropdowns are fixed at `w-[200px]`.
- Status styles use hand-built semantic color strings.
- Large rosters are not virtualized.

Rewrite:

- Split into:
  - `ContributorPolicySection`
  - `ContributorSearchCombobox`
  - `SelectedUsersToolbar`
  - `ContributorRoster`
  - `ContributorRoleSelect`
  - `ContributorStatusSelect`
  - `ContributorBulkRemoveDialog`
- Use a reducer or Zustand slice for selected users and selected contributors.
- Use `useImmediateCourseAction` for add, remove, role update, and status update.
- Add `aria-label` to row checkboxes and master checkbox.
- Use responsive cards below `md`, table above `md`.
- Add virtualization for `contributors.length > 50`.

### EditCourseStructure

Current strengths:

- Uses `@dnd-kit` with pointer and keyboard sensors.
- Uses DnD announcements.
- Persists order on drag end, which avoids unstable optimistic context mutation.

Problems to fix:

- DnD behavior, persistence, chapter creation, and rendering all live in `CurriculumEditor`.
- `ActivityElement` uses a `div` drag handle.
- Activity badges use raw color classes and status spans.
- Activity creation dialog owns several creation paths and direct query invalidation.
- Inline edit patterns repeat between chapters and activities.

Rewrite:

- Extract `useCurriculumDnd` for sensors, announcements, drag handlers, and save status.
- Extract `useInlineRename` for chapter and activity names.
- Convert drag handles to labelled buttons.
- Replace activity type/status spans with shared `CourseWorkflowBadge`.
- Move creation paths into an `activityCreateCommands.ts` module and a thin dialog component.
- Consider route preloading for edit/preview links on hover or focus.

### EditCourseCertification

Current strengths:

- Uses RHF with Valibot.
- Uses a live preview.
- Handles create, update, and delete in one save path.

Problems to fix:

- The page builds translated schema, initial values, CRUD behavior, and UI in one file.
- Certificate pattern choices use emoji icons as structural UI.
- `CertificatePreview` generates QR data even when preview values are placeholders.
- `mounted` state gates the whole page and delays rendering.
- Pattern picker uses manual selected styling and a badge instead of a more compact option group.

Rewrite:

- Extract schema and mapper functions.
- Create `CertificationSection`, `CertificationForm`, `CertificatePatternPicker`, and `CertificatePreview`.
- Replace pattern emoji with lucide icons, swatches, or mini layout thumbnails.
- Generate QR only for real certificate links.
- Keep the preview sticky on desktop, then move it below the form on mobile.
- Keep `CertificatePreview` reusable for public verification pages, but separate editor-only placeholders from real certificate rendering.

### ConflictResolutionModal

Current strengths:

- Centralizes conflict visibility and retry.
- Offers reload and save-anyway choices.

Problems to fix:

- The component is named `ConflictResolutionModal.tsx`, but it renders an inline alert.
- It refreshes only course meta on reload, while many conflicts come from editor bundle sections.
- The alert has no explicit live region.

Rewrite:

- Rename conceptually to `CourseConflictAlert`.
- Let conflict state carry a recommended refresh target: `meta`, `editor`, or `both`.
- Add `role="alert"` or `aria-live="polite"` depending on severity.
- Show which section caused the conflict when known.

## Cache Components and Next.js Plan

The app already enables `cacheComponents: true` in `apps/web/next.config.ts`. The rewrite should respect the three content types:

- Static shell: tab labels, route chrome shape, and section frame.
- Cached server data: course capability and initial course payload in route-level server components.
- Dynamic client state: editor forms, uploads, DnD, dirty guard, and popovers.

Rules:

- Do not put `cookies()`, `headers()`, or `searchParams` inside `use cache` functions.
- Keep mutations outside cached functions.
- After server mutations, keep existing `revalidateTag` coverage for public course, detail, access, contributors, and editable lists.
- In the client editor, keep TanStack Query as the source of editor freshness.
- Use Suspense around heavy client islands where the route shell can stream earlier.

## Visual Redesign Direction

Principles:

- Dense but calm. Teachers should scan state, make edits, and recover from errors quickly.
- One editor section pattern. Do not make every section invent its own card, alert, and action layout.
- Keep explanatory copy short. Controls and labels should carry the workflow.
- Separate staged actions from immediate actions with compact visual markers.
- Prefer semantic tokens over raw colors. The course editor should survive light/dark mode without per-page overrides.

Concrete UI changes:

- Replace repeated large alerts with compact `CourseEditorNotice` variants.
- Add a sticky dirty save bar for long sections.
- Use `FieldGroup` and `FieldSet` for form grouping.
- Use `Empty` and `Skeleton` for empty/loading states.
- Use `Badge` for states, not custom spans.
- Keep touch targets at least 44px.
- Add responsive roster cards for mobile.
- Use icon buttons only with tooltips and `aria-label`.

## Migration Plan

### Phase 1: Safety Harness

- Add focused tests around mappers for general values, certification values, contributor sorting, and activity URLs.
- Add interaction tests for dirty save/discard behavior in General, Access, Contributors, and Certification.
- Add keyboard tests for contributor selection and DnD handles.
- Add regression tests for conflict retry.

Validation:

- `vp install`
- `vp check`
- `vp test`
- `vp run test:e2e` for course editor flows if fixtures exist.

### Phase 2: Shared Editor Primitives

- Add `CourseEditorSection`, `CourseEditorSaveBar`, `CourseEditorNotice`, `PolicyChoiceGroup`, and `useCourseSectionDraft`.
- Migrate `EditCourseAccess` first. It is small and exposes the staged/immediate split clearly.
- Migrate `EditCourseGeneral` second, but leave `ThumbnailUpdate` as a compatibility component until media behavior is settled.

### Phase 3: Contributors Rewrite

- Extract contributor types and mappers.
- Replace local state clusters with reducer-style selection state.
- Split search, selected-user toolbar, roster, and dialogs.
- Add responsive roster rendering and checkbox labels.
- Add virtualization when roster size crosses the threshold.

### Phase 4: Curriculum Rewrite

- Extract DnD behavior into `useCurriculumDnd`.
- Convert chapter and activity rows to presentational components.
- Unify inline rename behavior.
- Move activity creation command logic out of `NewActivityButton`.
- Improve drag handle semantics and reduced-motion behavior.

### Phase 5: Certification Rewrite

- Extract schema and value mapping.
- Replace emoji pattern picker.
- Split preview from editor shell.
- Avoid QR generation for placeholder draft data.
- Keep public certificate verification pages working with the reusable preview API.

### Phase 6: Cache and Route Cleanup

- Review `renderCourseWorkspacePage` and route files for Suspense boundaries around heavy client sections.
- Ensure mutations invalidate both TanStack Query keys and Next cache tags that feed public surfaces.
- Keep route params async per Next 16 conventions.

## Acceptance Criteria

- Each section file is under 250 lines unless it is a pure table/list component.
- Each section has one explicit controller hook and mostly presentational child components.
- All staged sections share the same dirty/save/discard contract.
- All immediate actions share the same progress/conflict/refresh wrapper.
- No emoji acts as a structural icon.
- No clickable non-interactive elements remain for actions or row selection.
- Icon-only actions have `aria-label`.
- Form controls have labels, names, and useful autocomplete where applicable.
- Lists over 50 rows use virtualization or `content-visibility`.
- Mobile views have no horizontal overflow.
- Loading uses `Skeleton` or `Spinner`.
- Empty states use `Empty` or a shared editor empty component.
- The rewrite passes `vp check` and `vp test`.

## Open Questions

- Should thumbnail upload remain immediate, or should it become a staged media draft with explicit "Upload"?
- Do product owners want access policy and contributor policy on one combined Settings page, or kept as separate sections?
- What is the expected maximum contributor count and curriculum size?
- Should certificate templates remain decorative presets, or should the editor expose real certificate layout controls?
- Should conflict "Save anyway" be allowed for destructive immediate actions, or only staged form saves?
