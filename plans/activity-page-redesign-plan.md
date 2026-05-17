# Course Activity Page Rewrite And Redesign Plan

## Scope

Rewrite and redesign the student activity page at:

`/[locale]/course/[courseuuid]/activity/[activityuuid]`

The concrete route currently resolves through:

- `apps/web/src/app/[locale]/(platform)/(withmenu)/course/[courseuuid]/activity/[activityid]/page.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityToolbar.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityContentSurface.tsx`

The goal is not a visual refresh. The page should become the student's primary learning workspace: clear orientation, focused content, reliable progress, obvious next actions, and consistent behavior across video, document, interactive, submission, and assessment-like activities.

## Product North Star

The activity page should answer four student questions without making the student search:

1. Where am I in the course?
2. What should I do on this activity?
3. What is my current status?
4. What is the next best action?

A world-class LMS activity view should feel calm and work-focused. It should reduce page chrome while preserving navigation confidence. The student should be able to read, watch, submit, ask for help, mark completion, and move to the next activity without losing context.

## Current Critical Findings

1. The page has no strong workflow hierarchy.
   The current layout places breadcrumbs, title, chapter label, progress strip, content surface, duplicated toolbar, and secondary bar in a stacked sequence. The primary action competes with navigation, AI help, chapter dropdown, and focus mode. The student has to infer what matters.

2. Navigation is fragmented across several controls.
   `ActivityIndicators`, `ActivityChapterDropdown`, `ActivityToolbar` previous/next buttons, and `FixedActivitySecondaryBar` all provide overlapping ways to move through the course. This creates cognitive load and inconsistent behavior across scroll positions.

3. Completion state is not consistently wired.
   `ActivityIndicators` supports completion via `trailData`, but `ActivityClient` renders it without passing `trailData`. The top progress strip therefore cannot reliably show completed activities on this route, even though `ActivityToolbar` fetches trail data for marking status.

4. The sticky secondary bar is likely nonfunctional.
   `FixedActivitySecondaryBar` looks for `.activity-info-section` through `document.querySelector`, but the activity page does not render an element with that class. That means the observer may never activate, leaving the intended scrolled-state navigation absent.

5. The page duplicates action surfaces.
   `ActivityToolbar` appears near the title and again below the content. Focus mode renders another bottom toolbar. The same conceptual actions appear in different places with different options, which makes the interface feel assembled rather than designed.

6. Assessment routing is split and confusing.
   Page-level logic redirects `TYPE_FILE_SUBMISSION`, `TYPE_EXAM`, `TYPE_CODE_CHALLENGE`, and `TYPE_CUSTOM` to `/assessments/...` when an assessment exists. `ActivityContentSurface` still contains branches for file submission, exam, and code challenge. This makes the student experience dependent on backend availability and leaves unclear ownership between the activity page and assessment pages.

7. Focus mode is a mode switch, not a designed reading experience.
   Focus mode replaces the full page with a fixed overlay and stores a global localStorage flag. It hides the main nav through a shared event/storage mechanism. This is useful, but it should be integrated into the activity shell as a reading layout preference with predictable restoration and a clear escape path.

8. The content surface is too generic.
   Every activity is wrapped in a bordered padded container. Video, PDF, interactive content, file submissions, and empty states need different framing. A PDF or video should use available width and stable aspect rules; a text/interactive activity needs comfortable reading width; a submission activity needs a task/action layout.

9. Mobile workflow is underspecified.
   The dropdown has mobile width handling, but the full page does not define a mobile-first activity workflow. On phones, the student needs a bottom action bar, drawer-based outline, short status header, and content-first scrolling.

10. The UI mixes design languages.
    Some controls use local shadcn-style tokens, while others use legacy hardcoded colors such as `bg-gray-50`, `text-neutral-600`, and `rounded-full` pill treatments. The page should use semantic tokens, existing `components/ui/*` primitives, and consistent density.

## Student Jobs To Support

### Start Or Resume

The page should show the current activity, course progress, whether this activity is complete, and the most relevant action: continue, start, submit, retry, or next.

### Learn

The content should be readable and stable. The student should not fight small content columns, accidental nested cards, layout shifts, or hidden controls.

### Ask For Help

AI help should be contextual and available without dominating the header. It should know the activity, course, and current content type. It should be reachable from a compact help action and optionally a side panel on desktop.

### Complete

Completion should be explicit, reversible when allowed, and reflected immediately in the course outline, progress strip, and next-action area.

### Continue

The next activity should be the strongest post-completion action. Navigation should preserve orientation with previous/next labels, but not overwhelm the content.

## Target Information Architecture

Use one activity shell with four stable regions.

### 1. Activity Header

Purpose: orientation and status.

Desktop content:

- Course breadcrumb as compact text, not a dominant row.
- Activity title.
- Chapter name and position, for example `Chapter 2 · Activity 4 of 11`.
- Status chip: `Not started`, `In progress`, `Complete`, `Submitted`, `Needs revision`, `Locked`, or `Unpublished`.
- Optional metadata: duration, due date, attempt count, grade visibility.

Mobile content:

- Back-to-course button.
- Activity title truncated to two lines.
- Status chip and position.
- Outline button.

### 2. Course Progress And Outline

Purpose: orientation and navigation.

Desktop:

- Replace the current top strip plus chapter dropdown with a single course outline rail.
- Rail placement: left side on wide screens, collapsible drawer below `lg`.
- Show chapters as collapsible groups.
- Show each activity with icon, title, current state, completion state, and locked/unpublished state.
- Keep a compact horizontal progress meter in the header only for high-level progress, not as the main navigation.

Mobile:

- Use a `Sheet`/drawer opened by an outline button.
- Keep the drawer scrollable, with the current activity auto-scrolled into view.
- Provide previous/next controls in the bottom action bar.

### 3. Activity Content

Purpose: actual learning.

Use type-specific content frames:

- Dynamic/editor content: comfortable reading canvas, max width around prose content, no unnecessary border around the whole page.
- Video: full available content width with stable aspect ratio, transcript/resources below.
- Document/PDF: document viewer with height based on viewport, page controls, download/open actions.
- File submission: two-column task workspace with instructions and submission status/actions.
- Assessment/code challenge: either embed the canonical attempt experience in the activity shell or make the redirect explicit as a designed handoff card. Do not keep both implicit redirect and dead branches.

### 4. Action And Support Panel

Purpose: next best action.

Desktop:

- Right-side sticky panel on wide screens.
- Contains current status, primary CTA, secondary actions, and help.
- Primary CTA examples: `Mark complete`, `Continue attempt`, `Submit files`, `View feedback`, `Next activity`.
- Secondary actions: AI help, focus/reading layout, resources, report issue.

Mobile:

- Bottom sticky action bar with one primary CTA and an overflow menu.
- Outline and AI help open drawers.

## Proposed Desktop Layout

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Header: breadcrumb · title · chapter/activity position · status            │
├───────────────┬──────────────────────────────────────────────┬─────────────┤
│ Course outline│ Activity content                             │ Action panel│
│               │                                              │             │
│ Chapter 1     │ Type-specific learning surface               │ Status      │
│  ✓ Intro      │ Video/PDF/interactive/submission             │ Primary CTA │
│  ● Current    │                                              │ Help        │
│  ○ Next       │                                              │ Next/Prev   │
│ Chapter 2     │                                              │             │
└───────────────┴──────────────────────────────────────────────┴─────────────┘
```

Recommended responsive grid:

- `xl`: `280px minmax(0, 1fr) 300px`
- `lg`: `240px minmax(0, 1fr)`
- `< lg`: single column with drawers and bottom action bar

Do not put the whole page inside a decorative card. Use full-width page bands and constrained inner content. Cards are acceptable for repeated outline rows, submission file rows, feedback blocks, and modal/drawer contents.

## Proposed Mobile Layout

```text
┌──────────────────────────────┐
│ Compact header               │
│ Title, status, outline btn   │
├──────────────────────────────┤
│ Activity content             │
│                              │
│                              │
├──────────────────────────────┤
│ Sticky bottom primary action │
└──────────────────────────────┘
```

Mobile rules:

- Content appears before secondary panels.
- Bottom bar contains one primary action and previous/next icon buttons.
- Course outline opens in a drawer.
- AI help opens in a drawer or full-screen panel.
- No toolbar wrapping with many text buttons.

## Component Rewrite Plan

### New Student Activity Shell

Create a shell around the shared route implementation:

- `StudentActivityPageShell`
- `ActivityHeader`
- `ActivityOutline`
- `ActivityProgressSummary`
- `ActivityActionPanel`
- `ActivityMobileActionBar`
- `ActivitySupportPanel`
- `ActivityContentRenderer`

Keep the locale route wrapper thin. It should fetch server data, prefetch necessary query data, and pass a typed view model to the shell.

### Activity View Model

Introduce a normalized view model instead of passing raw `course`, `activity`, and independent query results through many components.

Suggested shape:

```ts
type StudentActivityViewModel = {
  course: {
    uuid: string;
    cleanUuid: string;
    title: string;
    thumbnailUrl?: string;
  };
  activity: {
    id: number;
    uuid: string;
    cleanUuid: string;
    title: string;
    type: ActivityType;
    published: boolean;
    chapterTitle?: string;
    chapterIndex: number;
    activityIndex: number;
    absoluteIndex: number;
  } | null;
  progress: {
    totalActivities: number;
    completedActivities: number;
    currentComplete: boolean;
    previous?: ActivityNavItem;
    next?: ActivityNavItem;
    chapters: ActivityOutlineChapter[];
  };
  permissions: {
    isAuthenticated: boolean;
    canView: boolean;
    canContribute: boolean;
  };
  state: {
    isCourseEnd: boolean;
    isAssessable: boolean;
    handoffUrl?: string;
    statusLabel: ActivityStudentStatus;
  };
};
```

This prevents each UI component from rebuilding course indexes, normalizing UUIDs, and rediscovering completion status.

### Navigation Unification

Replace:

- `ActivityIndicators`
- `ActivityChapterDropdown`
- `FixedActivitySecondaryBar`
- previous/next copies inside `ActivityToolbar`

With:

- `ActivityOutline` for full navigation.
- `ActivityProgressSummary` for compact progress.
- `ActivityPrevNext` for local previous/next controls.

The old components can remain temporarily for the course landing page, but the activity route should stop composing all of them together.

### Completion Flow

Completion should be owned by one hook:

```ts
useActivityCompletion({
  courseUuid,
  activityUuid,
  activityId,
  totalActivities,
});
```

Responsibilities:

- Read current trail/run state.
- Mark complete.
- Unmark complete when allowed.
- Optimistically update the outline and action panel.
- Invalidate `queryKeys.trail.current()`.
- Trigger gamification feedback without coupling UI buttons to the store.
- Redirect to course end only after the optimistic state confirms the course is complete.

### Activity Content Rendering

Keep content type logic in one renderer:

- `TYPE_DYNAMIC` -> interactive viewer
- `TYPE_VIDEO` -> video learning layout
- `TYPE_DOCUMENT` -> document learning layout
- `TYPE_FILE_SUBMISSION` -> native file submission layout
- `TYPE_EXAM` / `TYPE_CODE_CHALLENGE` / `TYPE_CUSTOM` -> canonical assessment handoff or embedded assessment shell

Decision needed: if assessments stay on `/assessments/[uuid]`, remove dead branches from `ActivityContentSurface` and make the activity page redirect/handoff policy explicit. If the activity page becomes the canonical student workspace for all activity types, move assessment runtime into the shell and stop redirecting.

## UX Details

### Header

- Keep title in a stable width, max two lines on mobile.
- Show status and position next to title.
- Avoid large breadcrumbs consuming vertical space.
- Use semantic tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`.

### Outline

- Current item should be visually obvious without animation.
- Completed items use a check icon and semantic success styling.
- Locked/unpublished items are visible but disabled with a reason tooltip.
- Long titles truncate on one line in the outline but full title appears in tooltip or accessible label.
- Chapters show `completed / total`.

### Primary Action

Exactly one primary action should dominate:

- Not complete learning content: `Mark complete`
- Complete learning content: `Next activity`
- Submitted file activity: `View submission`
- Draft file activity: `Continue draft`
- Assessment: `Continue attempt` or `Review result`
- Course end: `View certificate` or `Back to course`

Secondary actions should not compete visually with the primary action.

### AI Help

- Move AI help out of the crowded toolbar.
- Desktop: side panel launched from action panel.
- Mobile: drawer.
- Preserve activity context.
- Add empty/loading/error states that do not resize the page awkwardly.

### Focus / Reading Mode

Replace the overlay-style focus mode with a layout mode:

- Hide the left outline and right action panel.
- Keep a slim top bar with course, activity, exit, and next action.
- Store per-user preference, but do not surprise-enter focus mode on every activity unless the user explicitly chooses "always use reading mode".
- Escape key exits.
- The global nav hiding behavior can stay, but the page should own the visible reading-mode UI.

### Empty, Locked, And Unpublished States

Use designed state panels:

- Unpublished: explain that the activity is not available; teachers/contributors get edit link.
- Locked: explain prerequisite or date condition.
- Empty content: tell contributors how to add content; students see a neutral unavailable message.
- Unsupported type: show type and route metadata for debugging in non-production only.

## Visual Design Direction

The page should be quiet, dense, and trustworthy.

- Use neutral surface hierarchy, not decorative gradients.
- Use border and spacing to organize; avoid nested cards.
- Prefer shadcn primitives: `Button`, `Sheet`, `ScrollArea`, `Progress`, `Badge`, `Tooltip`, `DropdownMenu`, `Separator`.
- Use `lucide-react` icons consistently.
- Keep cards at `rounded-lg` or less unless existing components require otherwise.
- Avoid hardcoded neutral/gray/emerald colors in new code; use semantic tokens or add deliberate design tokens.
- Use stable dimensions for outline rows, action buttons, progress bars, and media frames to prevent layout shift.

## Accessibility Requirements

- Course outline is keyboard navigable.
- Current activity has `aria-current="page"`.
- Disabled activities include accessible reasons.
- Mark complete announces success/failure through toast and `aria-live`.
- Bottom mobile action bar does not cover focused inputs or submission controls.
- Focus mode can be exited by keyboard.
- Video/document controls preserve native accessibility.
- Progress is represented textually, not only by color.

## Performance And Architecture Requirements

Apply the local Next.js and React performance rules:

- Keep the route page as a Server Component where possible.
- Fetch course metadata, activity, session, assessment handoff, and initial trail/contributor data in parallel where independent.
- Avoid refetching contributor status and trail data separately in many child components.
- Pass a normalized serializable view model to client islands.
- Dynamically import heavy content renderers: editor viewer, video player, PDF viewer, file submission, AI panel.
- Keep the shell client component small; isolate interactive controls into focused client components.
- Avoid rebuilding the course activity index in every component; compute it once from the view model.
- Use Suspense boundaries around heavy content, not around the entire page shell.

## Implementation Phases

### Phase 1: Product And Data Baseline

- Map all activity types and current student states.
- Decide canonical behavior for assessments and file submissions: redirect/handoff or embedded workspace.
- Add a typed activity view-model builder.
- Prefetch trail state for the activity page and pass completion data to the shell.
- Remove reliance on DOM selectors such as `.activity-info-section`.

Deliverable: current route renders the same broad behavior but with reliable progress and a single normalized data contract.

### Phase 2: New Shell Behind A Feature Flag

- Build `StudentActivityPageShell`.
- Add desktop grid with outline, content, and action panel.
- Add mobile header, outline drawer, and bottom action bar.
- Keep existing content renderers inside the new shell.
- Gate with a local feature flag or route-level constant until verified.

Deliverable: new layout can be tested without deleting old components.

### Phase 3: Navigation And Completion Consolidation

- Replace `ActivityIndicators`, `ActivityChapterDropdown`, duplicated `ActivityToolbar`, and `FixedActivitySecondaryBar` on the activity route.
- Implement `useActivityCompletion`.
- Add optimistic completion updates.
- Make course-end navigation deterministic.

Deliverable: one source of truth for progress, one primary action, one outline.

### Phase 4: Content-Type Experience

- Redesign dynamic content reading width.
- Redesign video frame and transcript/resource placement.
- Redesign PDF/document viewer frame.
- Finalize file submission and assessment route ownership.
- Add state panels for unpublished, locked, empty, and unsupported activities.

Deliverable: each activity type has a fitting content frame, not a generic bordered box.

### Phase 5: AI Help And Reading Mode

- Move AI ask into a support panel/drawer.
- Convert focus mode into reading mode.
- Ensure global nav hiding and page restoration are predictable.
- Add keyboard exit behavior and persistence rules.

Deliverable: help and focus support the workflow without crowding the header.

### Phase 6: Polish, I18n, And Removal

- Add or update translations for all new labels in `en-US`, `ru-RU`, and `kk-KZ`.
- Remove dead activity branches after assessment/file-submission ownership is decided.
- Remove unused route-only components.
- Audit dark mode.
- Audit mobile spacing and sticky bars.

Deliverable: old route composition is gone; new shell is default.

## Testing Plan

### Unit And Component Tests

- View-model builder normalizes UUIDs and computes indexes correctly.
- Completion hook handles mark, unmark, optimistic update, error rollback, and course-end redirect.
- Outline renders current, complete, locked, unpublished, and long-title states.
- Primary action selection is correct for each activity status.

### Integration Tests

- Student opens a dynamic activity, marks complete, sees progress update, and navigates next.
- Student opens video/document activity and previous/next navigation preserves route structure.
- Contributor can view unpublished activity and sees edit/contribute action.
- Guest sees published content but authenticated-only actions are hidden or replaced with sign-in prompt.
- Assessment/file-submission behavior follows the chosen canonical route.

### Playwright Coverage

Run viewport checks for:

- Desktop: `1440x900`
- Laptop: `1280x800`
- Tablet: `768x1024`
- Mobile: `390x844`

Validate:

- No overlapping header/action content.
- Bottom mobile bar does not hide content.
- Outline drawer is usable.
- Current activity is visible in outline.
- Long Russian/Kazakh labels fit or truncate cleanly.
- Dark mode remains legible.

## Acceptance Criteria

- The first viewport clearly shows location, status, content start, and next action.
- There is one primary CTA at any moment.
- Course navigation has one main model: outline plus compact prev/next.
- Completion state updates across the page immediately.
- The page works without duplicated toolbar controls.
- Focus/reading mode is predictable and reversible.
- Mobile has a purpose-built workflow, not wrapped desktop controls.
- All new UI uses semantic tokens and existing UI primitives.
- Each activity type has a fitting content frame.
- No route-only component depends on querying arbitrary DOM classes.

## Open Product Decisions

1. Should assessments remain on `/assessments/[assessmentUuid]`, or should the course activity page become the canonical shell for attempts?
2. Should file submissions be native course activities only, or can legacy assessment-backed file submissions continue to redirect?
3. Should completion be manual for videos/documents/dynamic pages, automatic for some content types, or policy-driven per activity?
4. Should reading mode persist globally, per course, per activity, or only for the current session?
5. Should AI help be available to unauthenticated students viewing public courses?

## Recommended First Implementation Slice

Start with a low-risk vertical slice:

1. Build the view-model builder and pass `trailData` into the activity page.
2. Replace the stacked top controls with `ActivityHeader`, `ActivityProgressSummary`, and one `ActivityActionPanel`.
3. Keep existing content renderers unchanged.
4. Add mobile bottom action bar and outline drawer.
5. Remove `FixedActivitySecondaryBar` from the route.

This slice fixes the biggest workflow problems while avoiding a simultaneous rewrite of every activity renderer.
