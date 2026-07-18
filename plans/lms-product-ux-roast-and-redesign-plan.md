# Ashyq Bilim LMS product UX roast and redesign plan

## Design read

Reading this as: a serious education workflow platform for learners, teachers, and admins, not a landing page and not a toy gamified course site. The product should feel like a modern LMS command center: calm, fast, role-aware, evidence-rich, and explicit about what work needs attention next.

Recommended dials:

- **Visual density:** 6/10 for learners, 8/10 for teachers/admins.
- **Motion intensity:** 2/10. Use motion for state changes, not decoration.
- **Design variance:** 4/10. Trust and clarity beat novelty here.
- **Signature experience:** a role-aware "Work Queue" that always answers: what should I do next, why, and what happens if I do it?

## Executive roast

Ashyq Bilim has the ingredients of a next-generation LMS, but the current product still behaves like a bundle of powerful modules instead of one guided learning operating system.

The codebase already has serious surface area: student activity runtime, course authoring, assessments, code challenges, file submissions, grading review, gradebook, analytics, certificates, gamification, discussions, and AI. The problem is not ambition. The problem is that the product asks users to understand the app's architecture.

The dashboard is a directory, not a cockpit. The course page is a course brochure with learning controls bolted around it. The teacher area has many strong screens, but the teacher still has to hunt for "what needs my attention." The learner activity shell is much better than a generic content page, but the completion model is still too implicit. The AI sidecar has improved, but it is still not the spine of the learning workflow. The design system exists, yet legacy surfaces keep leaking hardcoded colors, custom cards, heavy shadows, `space-y-*`, `transition-all`, gradients, and decorative motion.

In plain terms: this LMS has features. It does not yet have enough product gravity.

## Evidence from the current repo

This plan is based on code inspection, existing project plans, and static scans.

- `apps/web/components.json` confirms a shadcn/base-nova setup with `lucide`, RTL support, React Server Components, and semantic CSS variables.
- `apps/web/src/components/ui/` has rich primitives: `sidebar`, `data-table`, `empty`, `field`, `input-group`, `toolbar`, `message`, `sheet`, `drawer`, `chart`, `table`, `badge`, `progress`, and more. The design system is present.
- `docs/DESIGN_GUIDELINES.md` already identifies the same visual debt: hardcoded Tailwind colors, gradients, decorative icons, excessive motion, and inconsistent shadcn usage.
- A static scan returned **948 directional hits** for spacing, hardcoded color, motion, shadow, radius, and gradient patterns. Not all are bugs, but the volume shows the system is not fully internalized.
- A scan returned **113 directional hits** for raw buttons, `role="button"`, and programmatic navigation patterns. Again, not all are wrong, but they deserve an accessibility/navigation audit.
- The app has duplicated route ancestry between `app/_shared/withmenu/*` and `app/[locale]/(platform)/(withmenu)/*`, plus dashboard route groups. This makes IA drift easy.
- `StudentActivityWorkspace` is one of the strongest product surfaces: it has a sticky activity header, outline rail, focus mode, bottom action bar, content-read completion, lock states, and an AI sidecar.
- `ActivityAIPanel`, `QAPanel`, and `CourseAnalysisResultShell` show the AI redesign has started: docked desktop panel, mobile drawer, URL-backed mode/thread state, thread list, starter prompts, queued run progress, citations, and publish confirmation.
- `PlatformDashHomePage` still renders section cards. It is a sitemap, not a role-specific operating dashboard.
- `CourseThumbnail` still uses image overlays, hover scale, owner badges, action menus, progress, author avatars, and card shadow polish that make browse views feel more like marketplace cards than work surfaces.
- `CourseClient` places `CourseAIHub` and discussions after course description and chapters, making assistive workflows feel secondary on the public course page.
- `GradingReviewWorkspace` has the right three-pane direction, but teacher action priority still lives inside local filters and panels instead of an organization-wide grading queue.
- `AssessmentWorkspaceShell` has a strong readiness strip and save ledger, but warning/success colors and issue chips are still local styling rather than a global LMS state language.
- `features/assessments/domain/progress.ts` defines progress labels/classes, but the classes are raw color recipes, not semantic LMS tokens.
- Inline quizzes and their stored compatibility data were fully removed.

## What is already good

Do not rewrite blindly. Several foundations should be preserved and expanded:

- **Student activity shell:** strong direction. Keep the sticky header, outline, focus mode, runtime-driven CTA, and independent AI sidecar.
- **Assessment studio:** the readiness strip, save ledger, lifecycle badge, and workspace navigation are the right product model.
- **Grading review:** the three-pane layout is the right mental model for high-throughput review.
- **AI runtime:** queued runs, progress, cancellation, citations, thread state, and capability gating are the right architecture.
- **shadcn/base-nova primitives:** the app has the component inventory needed to remove most custom UI debt.
- **URL-backed state:** analytics, grading, courses, and AI already use query state in places. Standardize it.

## Core diagnosis

### 1. The product lacks a universal "next work" model

Learners, teachers, and admins all need a prioritized command center. Today, the app mostly exposes areas: Courses, Analytics, Users, Admin, Settings. A world-class LMS exposes work:

- Learner: continue this lesson, submit this assignment, revise this returned work, review this feedback, finish this overdue activity.
- Teacher: grade these submissions, unblock this course publish, review these weak assessment items, respond to these learner questions, fix these at-risk cohorts.
- Admin: resolve these access failures, audit these AI costs, fix these integration errors, review these role changes.

The current dashboard is a navigation hub. It should be a work queue.

### 2. Course readiness is too shallow

`getCourseReadinessChecklist` checks details, media, curriculum, collaboration, access, and certificate. That is useful, but too coarse for a serious LMS. A course can pass that checklist while still having no measurable outcomes, weak sequencing, broken embeds, no due dates, poor assessment alignment, missing accessibility metadata, or no feedback policy.

The publish flow needs to become a readiness gate, not a friendly checklist.

### 3. The learner flow is strong at the activity level but weak across time

`StudentActivityWorkspace` handles one activity well. The bigger gap is continuity:

- What should the learner do today?
- What is due soon?
- What was returned?
- What feedback changed their next step?
- What skill did they just improve?
- Why is the current activity blocked?
- What is the shortest path to course completion?

The answer should not require opening every course.

### 4. Teacher work is scattered

Teachers have course management, assessment studio, grading review, analytics, gradebook, and AI. The pieces are strong, but teacher work should start from one queue:

- Needs grading
- Needs feedback release
- Returned for revision
- At-risk learner
- Overdue learner
- Course blocked from publish
- Assessment item with quality issue
- AI review waiting for approval

Right now, teacher tasks are discoverable only if the teacher knows which feature owns the work.

### 5. Analytics are reports, not interventions

Analytics pages exist, including overview, watchlist, learners at risk, courses, assessments, performance, operations, and admin. The next step is turning analytics into action:

- "Message these 12 learners"
- "Open the weakest activity"
- "Create remediation"
- "Adjust deadline"
- "Review assessment item"
- "Export evidence for coordinator"

Charts alone do not make an LMS world-class. Closed-loop intervention does.

### 6. AI has improved, but it is still a feature layer

The older AI plans correctly criticized the assistant as a drawer. The current code has addressed part of that: docked sidecar, wide modes, thread list, starter prompts, queued runs, and citations. The next AI gap is product integration:

- AI should attach to actual work items, not just modes.
- Teacher-facing AI output should create reviewable tasks and diffs.
- Learner AI should know the current heading, selection, assessment restrictions, and source boundaries.
- Admin AI should expose cost, safety, and quality telemetry as operational controls.

### 7. The visual system is partially adopted

The app has semantic tokens and shadcn primitives, but many surfaces still use one-off styling. The result is a product that can look polished in one screen and improvised in another.

The fix is not a new theme. The fix is a design-system migration with strict rules:

- no raw status colors in product components
- no custom empty/loading/error blocks when primitives exist
- no hover scale on operational cards
- no decorative gradients except controlled gamification moments
- no `transition-all`
- no local status vocabulary

## North-star product model

Build Ashyq Bilim around four role-aware workspaces.

### 1. Learner Home

Purpose: answer "what should I do next?"

Primary modules:

- Continue learning
- Due soon
- Returned for revision
- Feedback to review
- Recommended practice
- Certificates in progress
- Recent discussions
- AI study thread resume

The first screen should not be "available sections." It should be "today's learning work."

### 2. Teacher Work Queue

Purpose: answer "what needs my attention?"

Primary modules:

- Needs grading
- Feedback awaiting release
- Course publish blockers
- At-risk learners
- Assessment quality issues
- AI drafts awaiting review
- Discussion questions unanswered
- Upcoming due dates

This replaces the dashboard-as-directory pattern with a work operating surface.

### 3. Course Studio

Purpose: create, improve, publish, and monitor a course.

Primary modules:

- Overview
- Curriculum
- Assessments
- Access
- Gradebook
- Learners
- Quality review
- AI review
- Publish readiness

Course Studio should feel like one workspace with tabs/views, not multiple unrelated route pages.

### 4. Admin Operations

Purpose: keep the platform safe, healthy, and governable.

Primary modules:

- Users and roles
- Access incidents
- AI usage/cost/evals
- Assessment operations
- Integration health
- Audit log
- Content/storage risks
- System status

Admin screens should look like operations software: tables, filters, saved views, actions, audit trails.

## P0 product changes

### P0.1 Replace dashboard cards with role-aware command centers

Current problem:

- `dash/page.tsx` lists accessible sections as cards.
- It does not prioritize work, risk, deadlines, or learner/teacher/admin tasks.
- The page makes users choose an area before knowing where work exists.

Plan:

- Create a `WorkQueue` API and frontend model.
- Generate role-specific work items:
  - learner due/continue/revise/feedback/certificate
  - teacher grade/release/review/publish/respond/intervene
  - admin access/audit/AI budget/system health
- Replace dashboard cards with:
  - primary task rail
  - secondary metrics
  - saved views
  - role shortcuts
  - recent activity
- Keep section cards as a lower "Browse tools" section.

Acceptance criteria:

- A learner can identify the next learning action in under 5 seconds.
- A teacher can open the highest-priority grading/review task in one click.
- Admins see operational risk before navigation shortcuts.

### P0.2 Create one LMS status language

Current problem:

- Progress, submission, release, lifecycle, readiness, access, AI, and gamification states use local labels and color classes.
- `progress.ts` hardcodes raw color classes.
- Badge variants exist, but domain semantics are scattered.

Plan:

- Add `LmsStatus` tokens:
  - `not-started`, `in-progress`, `submitted`, `needs-grading`, `returned`, `graded-hidden`, `published`, `passed`, `failed`, `locked`, `overdue`, `draft`, `scheduled`, `archived`, `needs-review`, `ready`, `stale`, `ai-draft`, `ai-approved`
- Add one `LmsStatusBadge` and `LmsStatusIcon`.
- Replace local status color maps in grading, assessment, activity, course readiness, analytics, and AI.
- Make every status expose:
  - label
  - description
  - severity
  - allowed next actions
  - student visibility

Acceptance criteria:

- Same state means same label/color/action across activity shell, gradebook, grading review, analytics, and course studio.
- No product component owns raw status color classes.

### P0.3 Redesign course publish readiness as a gate

Current problem:

- Current readiness covers basic setup but not instructional quality.
- Teachers can treat "ready" as administrative completeness, not course quality.

Plan:

- Split readiness into three layers:
  - **Setup:** title, description, thumbnail, curriculum, access, contributors.
  - **Instructional quality:** measurable outcomes, sequencing, prerequisites, activity variety, assessment alignment.
  - **Operational safety:** due dates, grade release policy, accessibility, broken embeds, hidden answer keys, privacy, publish visibility.
- Make the course review route the canonical publish gate.
- AI review can suggest issues, but deterministic checks own blocking rules.
- Add a "Preview as learner" step before publish.
- Add "publish impact" summary:
  - who can see it
  - what becomes public
  - what notifications are sent
  - what grade/certificate rules activate

Acceptance criteria:

- Publish cannot happen without a visible checklist of blockers and warnings.
- Every blocker deep-links to the exact course studio view.
- AI-generated quality issues are marked as recommendations, not deterministic blockers.

### P0.4 Build a teacher grading and release queue

Current problem:

- `GradingReviewWorkspace` works once a teacher is inside a review page.
- There is no single queue spanning all courses and assessment types.
- Feedback release is a separate mental step that can be forgotten.

Plan:

- Add `/dash/work/teacher` or make `/dash` role-aware.
- Show queue rows:
  - learner
  - course/activity
  - submission age
  - due/late status
  - AI analysis status
  - release state
  - next action
- Add saved filters:
  - Needs grading
  - Awaiting release
  - Returned revisions
  - Late submissions
  - Low-confidence AI
- Deep-link rows into `GradingReviewWorkspace` with selected submission and filter state.

Acceptance criteria:

- Teachers do not need to open individual courses to find grading work.
- Feedback awaiting release is visible as work, not hidden metadata.
- Bulk release and bulk return actions have confirmation and audit notes.

### P0.5 Make learner due work first-class

Current problem:

- Due dates exist in activity and assessment metadata.
- Learners do not have a strong agenda/calendar view.

Plan:

- Add learner agenda:
  - due today
  - due this week
  - overdue
  - returned for revision
  - waiting for grade
  - upcoming assessments
- Add teacher agenda:
  - release windows
  - scheduled assessments
  - grading SLA
  - course publish dates
- Add iCal export only after the in-app agenda is useful.

Acceptance criteria:

- Learners can see all upcoming work without entering each course.
- Teachers can see grading load by date.
- Empty agenda explains why it is empty and where to browse courses.

## P1 product changes

### P1.1 Convert analytics into intervention workflows

Current problem:

- Analytics pages show data, but action loops are not dominant enough.

Plan:

- Add intervention cards to watchlist and at-risk learner pages.
- Each insight should support a next action:
  - message learner
  - assign remediation
  - extend deadline
  - open weak activity
  - review assessment item
  - export learner evidence
- Add intervention state:
  - suggested
  - drafted
  - sent
  - dismissed
  - resolved
- Add audit log for teacher/admin interventions.

Acceptance criteria:

- Top analytics risks have an action button and a resolution state.
- Teachers can track whether an intervention improved learner progress.

### P1.2 Make AI task-native

Current problem:

- The AI sidecar is now better structurally, but it is still organized around modes.

Plan:

- Add AI commands based on current task:
  - "Explain selected text"
  - "Generate practice from this section"
  - "Review this assessment item"
  - "Draft feedback for this submission"
  - "Create remediation for this learner"
  - "Summarize why this learner is at risk"
- Every AI artifact gets state:
  - draft
  - edited
  - approved
  - published
  - dismissed
  - stale
- Add source navigation from citations into activity/editor anchors.
- Add stale markers when course/submission content changed after AI output.

Acceptance criteria:

- AI actions appear where the work happens, not only inside the assistant panel.
- Teacher-visible AI output cannot become student-visible without review.
- Citations navigate to real source anchors where possible.

### P1.3 Redesign course browse and course cards for learning decisions

Current problem:

- `CourseThumbnail` behaves like a marketplace card: image overlay, hover scale, owner badge, author pile, progress, action area, admin menu.
- It mixes learner decision-making, teacher management, and admin actions into one card pattern.

Plan:

- Split cards by context:
  - Learner course card: progress, next activity, due status, continue CTA.
  - Catalog course card: title, instructor, level, duration, outcomes, start/enroll CTA.
  - Teacher management row/card: readiness, visibility, last edited, blockers, manage CTA.
- Remove hover scale and decorative overlays from management cards.
- Use table/list views as default for teacher course management.
- Keep image-forward cards only for learner discovery/catalog.

Acceptance criteria:

- Same course does not use the same card for browsing, learning, and managing.
- Teacher course management prioritizes status and next action over thumbnail aesthetics.

### P1.4 Redesign the public course page around action and proof

Current problem:

- `CourseClient` presents title, media, description, learnings, chapters, AI, discussions, and sidebar actions.
- AI/discussions are below core content, so help and social proof feel secondary.
- Current learner progress is visible, but not enough as a decision driver.

Plan:

- Above the fold:
  - title
  - primary action
  - progress/eligibility
  - next activity if enrolled
  - due/lock/access status
  - instructor and course stats
- Main body:
  - outcomes
  - curriculum
  - assessments and certificate rules
  - discussions preview
  - AI study entry
- Sidebar:
  - sticky enrollment/continue card
  - access state
  - certificate availability
  - teacher/admin edit shortcuts only when relevant

Acceptance criteria:

- Enrolled learner sees next action before course marketing content.
- Non-enrolled learner sees enough proof to decide whether to start.
- Teacher/admin controls do not visually compete with learner actions.

### P1.5 Standardize authoring save, conflict, and readiness UX

Current problem:

- Save guards and save badges exist, but authoring surfaces can still drift.
- Course editor, assessment studio, profile builder, file submission studio, and markdown editor use different interaction models.

Plan:

- Create one `AuthoringChrome` contract:
  - title/breadcrumb
  - save ledger
  - dirty sections
  - conflict state
  - preview
  - publish/review action
  - AI trigger
- Use it across:
  - course curriculum
  - dynamic activity editor
  - assessment studio
  - file submission studio
  - certificate designer
- Standardize copy:
  - Saved
  - Saving
  - Unsaved changes
  - Save failed
  - Conflict detected
  - Offline changes pending

Acceptance criteria:

- Every authoring surface shows the same save/conflict language.
- Navigation guards cover refresh, route change, tab close, and AI panel actions when relevant.

### P1.6 Remove incomplete embedded quiz behavior (resolved)

Resolution:

- Removed inline quiz creation, authoring, fake attempts, and parser compatibility.
- Added migration `a4b5c6d7e8f9` to purge stored nodes and backing records.

Acceptance criteria:

- No authoring option creates a fake or partial learning object.
- Existing inline quiz nodes are removed by the deployment migration.

## P2 product changes

### P2.1 Build competency and outcome mapping

Plan:

- Add learning outcomes at course, chapter, activity, and assessment-item levels.
- Map assessment items to outcomes.
- Show learner mastery by outcome, not only by course completion.
- Let AI review detect unmapped or weakly assessed outcomes.

### P2.2 Add cohort and group operations

Plan:

- Build cohort pages for teachers/admins.
- Show progress distribution, due work, risk, interventions, access, and group messages.
- Make user groups more than access containers.

### P2.3 Make certificates evidence-backed

Plan:

- Certificate page should show what evidence earned the certificate:
  - completed activities
  - assessments passed
  - date
  - issuer
  - verification ID
- Admins need revocation and audit workflows.

### P2.4 Add notification center

Plan:

- Learners: due dates, returned work, feedback released, discussion replies, certificates.
- Teachers: submissions, questions, publish blockers, AI drafts, at-risk learners.
- Admins: role changes, system failures, AI budget, access incidents.

## Design-system migration plan

### Rules

- Use shadcn/base-nova primitives before custom markup.
- Use `FieldGroup`, `Field`, and `InputGroup` for forms.
- Use `Empty`, `Alert`, `Skeleton`, `Badge`, `Progress`, `Table`, `Card`, `Tabs`, and `Toolbar` instead of local styled blocks.
- Replace `space-y-*` and `space-x-*` with flex/grid gaps in touched components.
- Replace `transition-all` with explicit transitions.
- Replace raw status colors with LMS semantic variants.
- Remove hover scale from operational cards and management controls.
- Keep gamification visual flair isolated to gamification moments, not core LMS management UI.
- Use `data-icon` for icons inside buttons and avoid manual icon sizing in shadcn components.

### Migration order

1. LMS status tokens and `LmsStatusBadge`.
2. Dashboard/work queue components.
3. Course management table/cards.
4. Gradebook and grading review status/action bars.
5. Assessment studio readiness and save ledger.
6. Public course page and learner cards.
7. Editor extensions and legacy `_shared` surfaces.
8. Gamification visual debt, except intentionally playful surfaces.

## IA and routing cleanup

### Current problem

There are duplicated route groups and shared implementations under `_shared/withmenu` and localized platform routes. This may be pragmatic during migration, but it should not become the long-term IA.

### Plan

- Create a route inventory document:
  - public catalog
  - learner workspace
  - teacher workspace
  - course studio
  - assessment studio
  - admin operations
  - account settings
- Map every route to a product owner and role.
- Keep URL slugs stable where users or SEO rely on them.
- Move shared route implementations into feature-level components, not `app/_shared`.
- Add route manifest snapshot tests for accidental route additions/removals.

### Acceptance criteria

- Every route has a product purpose, role, and primary action.
- Shared UI is not organized around old route ancestry.

## Accessibility and interaction plan

Use the current Web Interface Guidelines as quality gates:

- Icon-only buttons need `aria-label`.
- Async updates need `aria-live="polite"`.
- Form controls need labels, useful names, autocomplete, and inline errors.
- URL reflects filters, tabs, pagination, selected queue item, and AI state.
- Destructive actions need confirmation or undo.
- Large tables/lists need virtualization or pagination.
- Dates and numbers use locale-aware formatting.
- Text must handle long Russian/Kazakh strings with `min-w-0`, truncation, wrapping, or line clamps.
- Motion respects reduced motion and only animates transform/opacity where needed.

Priority audits:

1. Raw buttons and `role="button"` in editor, gradebook, activity indicators, assessment builder, and data-table filters.
2. Programmatic navigation that should be links for middle-click/Cmd-click support.
3. Placeholder-only form fields in auth, assessment, grading, course creation, and editor dialogs.
4. Fixed bottom bars on mobile for safe-area and overlap.
5. Tables and long learner lists for keyboard access and virtualization.

## Implementation roadmap

### Week 1: Product contracts

- Define `WorkQueueItem` model.
- Define `LmsStatus` model.
- Create route inventory.
- Define learner/teacher/admin dashboard requirements.
- Inline quiz decision resolved: remove the feature and migrate stored compatibility data.

### Week 2: Dashboard rewrite

- Replace dashboard card grid with role-aware work queue.
- Keep tools/sections as secondary browse area.
- Add empty states and permission-aware no-work states.
- Add Playwright smoke for learner/teacher/admin dashboard variants.

### Weeks 3-4: Course Studio and readiness

- Expand readiness gate.
- Add preview-as-learner.
- Add publish impact summary.
- Refactor course management cards/rows by context.
- Replace local status classes with `LmsStatusBadge`.

### Weeks 5-6: Teacher queue and grading

- Build cross-course teacher queue.
- Deep-link into grading review with selected submission.
- Add awaiting-release queue.
- Add audit note requirements for bulk release/return.
- Add teacher grading SLA metrics.

### Weeks 7-8: Learner agenda and course page

- Build learner agenda.
- Redesign course page around enrolled vs not enrolled states.
- Add feedback-to-review and returned-work modules.
- Add certificate progress module.

### Weeks 9-10: Analytics interventions

- Add intervention actions to watchlist and at-risk learner pages.
- Add intervention state and audit log.
- Add remediation draft workflow.
- Track whether interventions resolve risk.

### Weeks 11-12: AI task integration

- Add context-specific AI commands.
- Add AI artifact lifecycle.
- Add citation-to-source navigation.
- Add stale AI output markers.
- Add admin AI budget/cost alerts to work queue.

## Validation plan

### Product tests

- Learner can reach next due/continue/revise action from dashboard in one click.
- Teacher can reach oldest needs-grading submission from dashboard in one click.
- Teacher can publish a course only after inspecting readiness blockers.
- Admin can find AI budget/risk status without opening raw settings.

### Playwright

- Learner dashboard agenda.
- Course page enrolled vs anonymous.
- Student activity shell with bottom action bar and AI sidecar.
- Course studio publish readiness.
- Assessment studio save/readiness.
- Teacher work queue to grading review deep-link.
- Analytics watchlist to intervention action.
- Mobile bottom navigation and safe area.

### Visual checks

- 390 x 844 mobile.
- 768 x 1024 tablet.
- 1366 x 768 laptop.
- 1440 x 900 desktop.
- 1920 x 1080 wide desktop.
- Light and dark modes.
- English, Russian, and Kazakh strings.

### Metrics

- Learner "next action found" time under 5 seconds.
- Teacher "oldest grading task opened" under 10 seconds.
- Course publish blocker resolution completion rate.
- Fewer duplicate support questions about locked/disabled actions.
- Reduced teacher grading backlog age.
- AI output publish actions with 100 percent human review state.

## Priority order

1. Role-aware dashboard/work queue.
2. Unified LMS status language.
3. Course publish readiness gate.
4. Teacher grading/release queue.
5. Learner agenda and returned-feedback flow.
6. Analytics-to-intervention workflows.
7. Context-specific AI commands and artifact lifecycle.
8. Course page and course card context split.
9. Authoring chrome standardization.
10. IA/routing cleanup.
11. Design-system debt migration.
12. Inline quiz decision and cleanup.

## Final product bar

Ashyq Bilim should stop feeling like "courses plus assessments plus dashboards plus AI." It should feel like an education operations system where every role has a clear queue, every object has an explicit state, every state suggests the next action, and every high-impact action is reviewable, auditable, and easy to recover from.

The fastest path is not a full rewrite. It is a product-model rewrite: build the work queue and LMS status language, then progressively pull every existing feature into that spine.
