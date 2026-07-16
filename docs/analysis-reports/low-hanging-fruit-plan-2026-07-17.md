# Low-Hanging Fruit Plan

Audit date: 2026-07-17  
Repository: `X:\projects\ashyq-bilim`  
Scope: unfinished features, legacy code, compatibility risks, duplicate code, dead code, and weak validation gates

## Audit snapshot

The production build and backend tests pass. The frontend validation path does not.

| Check                                     | Result                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp install`                              | Completed; exposed a `package.json` / `bun.lock` Next version mismatch                                                                                              |
| `vp check`                                | Failed on two formatting issues                                                                                                                                     |
| `vp check --no-fmt`                       | Passed with one class error-boundary warning                                                                                                                        |
| `vp test list`                            | Failed because `next-intl` resolves a nested Next copy without `next/navigation`                                                                                    |
| `vp test run`                             | Timed out after 184 seconds without output                                                                                                                          |
| `bun run build`                           | Passed; Next warned about the TypeScript native-preview compiler                                                                                                    |
| `bun run --cwd apps/api test`             | 211 passed, 8 warnings                                                                                                                                              |
| `bun run --cwd apps/api check:migrations` | 62 revisions, one head, no broken references                                                                                                                        |
| `bun run check:contracts`                 | Failed; generated Orval 8.20 headers differ from installed Orval 8.22                                                                                               |
| `bun run --cwd apps/web knip`             | Found one real unused source file, three unused direct dependencies, one undeclared binary, and noisy generated-code findings                                       |
| `bun run audit:errors`                    | Exited successfully despite 141 broad backend catches, 75 raw `HTTPException` sites, 100 frontend `console.error` calls, and three query fallbacks without error UI |
| `vp env doctor`                           | Passed                                                                                                                                                              |

The working tree was clean after the audit. Audit probes and generated-file rewrites were restored.

## Priority order

Run the tasks in this order:

1. Repair the frontend toolchain and test resolver.
2. Repair CI checks that currently inspect missing paths or run missing tests.
3. Restore generated API type safety.
4. Dispatch the independent frontend and backend cleanup tickets.
5. Start inline-quiz work after the quick-win queue is empty.

## Agent dispatch map

Agents can run tasks in the same row at the same time. Tasks in the same collision group should run serially or use separate worktrees and rebase carefully.

| Wave | Parallel tasks                           | Collision group                                                            |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------- |
| 0    | LH-01, LH-02                             | LH-01 owns package manifests and `bun.lock`; LH-02 owns workflows and docs |
| 1    | LH-03                                    | Generated contracts; start after LH-01                                     |
| 2    | LH-04, LH-05, LH-06, LH-07, LH-08, LH-09 | Distinct feature and service files                                         |
| 3    | LH-10                                    | Package manifests again; start after LH-01 and LH-09                       |
| 4    | UF-01, UF-02                             | Same TipTap inline-quiz directory; run serially                            |

## Ready-to-assign tickets

### LH-01: Make the frontend toolchain reproducible

Priority: P0  
Estimate: 2 to 4 hours  
Owner files: `package.json`, `apps/web/package.json`, `bun.lock`, `vite.config.ts`, `apps/web/vite.config.ts`

Evidence:

- `apps/web/package.json` requests Next `16.3.0-preview.6`; `bun.lock` records the workspace request as `16.3.0-preview.5`.
- Bun installs nested Next `16.2.9` copies for `next-intl`, `@next/third-parties`, and `nextjs-toploader` because the preview version does not satisfy their peer ranges.
- `vp test list` fails while importing `next/navigation` from the nested `next-intl` dependency tree.
- The root override pins Vite+ core `0.2.2` while `vite-plus` is `0.2.4`.
- The root catalog pins Vitest `4.1.9`; Vite+ and the browser packages use `4.1.10`.
- `apps/web/package.json` invokes `tsgo`, but no direct dependency exposes that binary. The command succeeds on the audited workstation because a global `tsgo.ps1` exists.
- `next build` warns that it detected the native-preview compiler and cannot provide every Next TypeScript feature.

Task:

1. Use `node_modules/next/dist/docs/` to select one Next version that satisfies the installed framework integrations.
2. Ensure Bun installs one Next runtime. Remove nested peer copies caused by the preview mismatch.
3. Align Vite+, Vite+ core, Vitest, and `@vitest/*` to one compatible release set.
4. Replace the global `tsgo` dependency with an installed project binary. Prefer `tsc --noEmit` from the declared `typescript` package unless the project declares a native-preview package directly.
5. Run `vp install` and commit the lockfile update.
6. Keep unrelated dependency upgrades out of this ticket.

Acceptance:

- `vp test list` completes without `ERR_MODULE_NOT_FOUND`.
- `vp test run` starts promptly and finishes.
- `vp check --no-fmt` passes.
- `bun run build` passes without a compiler-resolution warning.
- `bun pm ls --all` shows one intended Next version and one Vitest release set.
- A clean machine does not need a global `tsgo` command.

### LH-02: Repair CI checks and stale type-safety documentation

Priority: P0  
Estimate: 1 to 2 hours  
Owner files: `.github/workflows/*.yaml`, `docs/FULLSTACK_TYPESAFETY.md`

Evidence:

- `.github/workflows/contract-sync.yaml` checks `apps/web/src/lib/api/generated/schema.ts`. That file does not exist. The generated schema file is `apps/web/src/lib/api/generated/api.schemas.ts`, and the generator changes many files below the generated directory.
- `docs/FULLSTACK_TYPESAFETY.md` documents the old `apps/web/lib/api/generated/schema.ts` path.
- The API test workflow runs `src/tests/security/`. The repository contains `src/tests/test_security.py` and no `src/tests/security/` directory.
- The web lint workflow installs with `--no-frozen-lockfile`, uses the latest Bun instead of `bun@1.3.14`, and invokes a lint script that applies fixes in CI.
- The API lint workflow bypasses the pinned Ruff environment and skips `scripts/lint_response_models.py`.

Task:

1. Replace the contract workflow's handwritten generation and incomplete `git diff` command with `bun run check:contracts`.
2. Fix or remove the nonexistent security-test path. Do not run the same test twice under two names.
3. Make CI installs frozen and run them from the workspace root.
4. Pin Bun and uv to the repository-supported versions instead of `latest`.
5. Make web CI run a check-only command. It must fail on formatting, lint, or type errors without rewriting files.
6. Make API lint use the locked environment and run both Ruff and the response-model checker without auto-fixing.
7. Update `docs/FULLSTACK_TYPESAFETY.md` with current artifact paths and commands.

Acceptance:

- Local equivalents of every workflow command pass or report the known frontend test blocker from LH-01.
- Contract CI detects a one-line change in any file under `apps/web/src/lib/api/generated/`.
- API CI references only paths that exist.
- Workflow installs do not update lockfiles.

### LH-03: Remove the API-wide `any` compatibility shim

Priority: P0  
Estimate: 1 to 2 hours  
Depends on: LH-01  
Owner files: `apps/web/scripts/postprocess-orval-output.mjs`, `apps/web/src/services/courses/courses.ts`, generated API files

Evidence:

`apps/web/scripts/postprocess-orval-output.mjs` defines:

```ts
type Compat<T> = T extends never ? never : any;
```

Every `components['schemas'][...]` lookup therefore becomes `any`. A reversible audit probe changed the alias to `type Compat<T> = T` and ran `vp check --no-fmt`. TypeScript reported one error:

```text
apps/web/src/services/courses/courses.ts:218
ChapterReadWithPermissions[] is not assignable to AppChapter[]
```

Task:

1. Change the generator postprocessor to preserve each Orval schema type.
2. Fix the single course chapter normalization mismatch with an explicit transport-to-UI mapping or a correct generated transport type. Do not cast it to `any`.
3. Regenerate contracts with installed Orval 8.22 so generator headers match the package version.
4. Update generated artifacts through the generator. Do not hand-edit hundreds of files.
5. Add a small guard in the postprocessor test or contract check that rejects a compatibility alias returning `any`.

Acceptance:

- `rg "type Compat.*any" apps/web` returns no result.
- `bun run check:contracts` passes on a clean tree.
- `vp check` passes.
- Existing web tests pass after LH-01.

### LH-04: Restore a green local validation baseline

Priority: P1  
Estimate: 15 to 30 minutes  
Depends on: LH-01

Evidence:

`vp check` reports formatting drift in:

- `apps/web/src/components/ui/widget-error-boundary.tsx`
- `apps/web/src/tests/file-submissions/review-workspace.test.tsx`

Oxlint also warns about `setState` inside the class-based error boundary. React error boundaries require a class and state updates, so the warning needs a narrow suppression rather than a rewrite.

Task:

1. Run the repository formatter on the two files.
2. Add the narrowest supported suppression for the class error-boundary reset method.
3. Do not disable `react/no-set-state` globally.

Acceptance:

- `vp check` exits zero with no warning.
- The widget error-boundary tests still exercise reset behavior.

### LH-05: Show errors instead of empty data in three query-backed panels

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: `apps/web/src/features/ai-admin/components/ai-operations-console.tsx`, `apps/web/src/features/course-qa/components/course-ai-hub.tsx`, frontend error-audit script

Evidence:

The frontend error audit reports three `QUERY_FALLBACK_WITHOUT_ERROR_UI` findings:

- `ai-operations-console.tsx:36`
- `ai-operations-console.tsx:147`
- `course-ai-hub.tsx:90`

Task:

1. Check `query.isError` and render the existing shared error-state component before falling back to empty arrays or objects.
2. Preserve retry actions and existing loaded data where TanStack Query supplies it.
3. Change the frontend audit so new query-fallback findings fail the command. Keep a baseline for the broader `console.error` migration.

Acceptance:

- Tests cover loading, error, empty, and success states for both panels.
- The audit reports zero query fallbacks without error UI.
- `bun run --cwd apps/web audit:errors` fails if an agent adds another silent fallback.

### LH-06: Reject nonexistent resources in user-group access grants

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: `apps/api/src/services/users/usergroups.py`, user-group API tests

Evidence:

`add_resources_to_usergroup()` accepts arbitrary comma-separated UUIDs and contains `TODO: Find a way to check if resource really exists`. Access checks later join these values to course UUIDs. An invalid grant can remain dormant and start matching if a future course receives the same UUID.

Task:

1. Parse, trim, and deduplicate the requested UUIDs.
2. Fetch matching courses in one query.
3. Reject unknown UUIDs before writing any `UserGroupResource` row.
4. Preserve the existing RBAC check and all-or-nothing behavior.

Acceptance:

- Tests cover valid UUIDs, duplicates, whitespace, a mixed valid/invalid batch, and rollback on failure.
- No row is written for a nonexistent course.
- `bun run --cwd apps/api test` passes.

### LH-07: Deduplicate grading status and score helpers

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: `apps/web/src/features/assessments/domain/submission-status.ts`, `apps/web/src/features/assessments/domain/score.ts`, `apps/web/src/features/grading/domain/status.ts`, `apps/web/src/features/grading/domain/scoring.ts`

Evidence:

The assessments and grading domains define the same submission labels, transition table, status guards, teacher-action rules, score parser, and percent formatter. The assessments file already calls itself the canonical source while the grading copy remains active.

Task:

1. Keep the assessments domain as the source for shared submission and score rules.
2. Import or re-export those helpers from the grading domain.
3. Leave grading-only color, release-state, progress-state, and item aggregation helpers in the grading domain.
4. Preserve current public import paths where cheap re-exports avoid a large call-site diff.

Acceptance:

- One transition table and one score parser remain.
- Existing assessment and grading tests pass.
- Add one shared test for whitespace score input because the two parsers currently differ there.

### LH-08: Remove five copies of the analytics page loader

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: `apps/web/src/app/[locale]/(platform)/dash/analytics/*/page.tsx`, one new private shared component below the analytics route

Evidence:

The `overview`, `operations`, `performance`, `watchlist`, and `admin` pages repeat the same props, Suspense fallback, query normalization, translations, parallel overview/admin request, 401/403 handling, and empty state. Each page changes the active tab and tab component.

Task:

1. Extract one route-private server component for shared loading and error handling.
2. Keep each page as a short typed wrapper that selects its tab content.
3. Keep the two data requests parallel.
4. Do not create a generic application-wide page framework.

Acceptance:

- Each of the five page files contains only route-specific wiring.
- Analytics route tests cover the shared unauthorized-admin path and the shared load-error path once.
- `bun run build` retains all five routes.

### LH-09: Make Knip actionable and delete confirmed dead code

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: `apps/web/knip.json`, `apps/web/package.json`, `bun.lock`, dead source files

Evidence:

Knip reports:

- Unused source: `src/features/courses/create/CourseCreateReviewPanel.tsx`
- Unused direct dependencies: `@ag-ui/core`, `@shadcn/react`, `streamdown`
- Four unused generated Zod files
- 3,814 unused exports, dominated by generated contracts and barrel exports
- Two stale ignore entries that Knip asks to remove

Task:

1. Delete `CourseCreateReviewPanel.tsx` after confirming no dynamic import or planned route references it.
2. Remove the three unused direct dependencies.
3. Exclude generated contract files from unused-file and unused-export findings. Do not delete generator output by hand.
4. Remove stale Knip ignore entries and inspect the newly visible findings.
5. Keep only findings that a coding agent can act on.

Acceptance:

- `bun run --cwd apps/web knip` reports no unused source files or dependencies.
- Generated Orval exports do not flood the report.
- `vp install`, `vp check`, and web tests pass.

### LH-10: Do not remove the ESLint stack!

### LH-11: Clear the eight backend test warnings

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: assessment review service, collections query, Google OAuth test fixtures

Evidence from the 211-test run:

- Two uses of deprecated `HTTP_422_UNPROCESSABLE_ENTITY`
- One SQLAlchemy `DISTINCT ON` warning under the SQLite test dialect
- Five JWT warnings caused by a 29-byte test secret

Task:

1. Use `HTTP_422_UNPROCESSABLE_CONTENT`.
2. Give OAuth tests a 32-byte or longer HMAC secret.
3. Replace the dialect-sensitive distinct query with portable SQL or isolate PostgreSQL-only behavior behind a tested dialect branch.

Acceptance:

- `bun run --cwd apps/api test` reports 211 or more passing tests and no warnings from these sources.
- Production behavior and response status codes remain unchanged.

### LH-12: Make the finalized-upload read URL work

Priority: P1  
Estimate: 1 to 2 hours  
Owner files: `apps/api/src/routers/uploads/chunked_upload.py`, upload service helpers, upload endpoint tests

Evidence:

`GET /uploads/{upload_id}/url` claims to return a read URL for a finalized upload. It currently points `get_url` at `PUT /uploads/{upload_id}/bytes`. That route cannot download a finalized file and rejects finalized uploads.

Task:

1. Add an authenticated download route for finalized uploads, following the working `file-submissions/files/{id}/download` pattern.
2. Read from `upload.storage_key`, stream bytes, preserve content type, and send a safe content-disposition header.
3. Point the URL endpoint to the download route.
4. Keep object-storage signing out of this ticket. The current filesystem backend only needs a correct local implementation.

Acceptance:

- An owner can upload, finalize, request a URL, and download identical bytes.
- A different user receives 403 or 404 according to the existing ownership policy.
- Non-finalized and missing files return explicit errors.
- API tests pass and contracts regenerate cleanly.

## Verified unfinished features outside the quick-win queue

These features need product or data-model work. Do not mix them into cleanup tickets.

### UF-01: Fully remove inline-quiz feature

### UF-03: Decide the gamification scope

Estimate: product decision plus 1 to 3 days

- Leaderboard `rank_change` is always `None`; the UI already knows how to render a value.
- Avatar frames and accessories remain hidden because backend profile fields do not exist.
- Translation files contain a user-streak categorization TODO that no component reads.

Pick one small deliverable. Rank movement needs a historical snapshot. Avatar equipment needs persistence and API contracts. Delete the unused translation TODO now if neither feature enters the roadmap.

### UF-04: Configure or remove file plagiarism claims

Estimate: external integration decision

File-submission plagiarism jobs call a provider registry whose default provider always returns `{score: 0, flagged: false}`. The old in-process subscriber is exported but startup now enqueues Taskiq work instead. Remove the dead subscriber class. Then label the provider as disabled in product responses until a real provider is configured; a silent clean score can mislead teachers.

## Legacy code to keep for now

| Code                                                              | Reason to retain                                                            | Removal condition                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Alembic migrations with legacy table and field cleanup            | Migration history must remain immutable                                     | Never rewrite applied migrations; squash only under an explicit deployment plan                 |
| `EDITOR_LEGACY_PATH_RE` and assessment deep-link route            | Existing bookmarks may use old URLs                                         | Remove after access logs show no old-route traffic for a defined period                         |
| Editor JSON normalization for `blockQuiz` and other old nodes     | Stored course content may still contain old node shapes                     | Run a database audit and migration, then remove the read-time adapter                           |
| Assessment `can_edit`, `can_save_draft`, and `can_submit` flags   | The frontend still reads all three                                          | Migrate the frontend to fine-grained actions first                                              |
| `AssessmentAttemptProjection` and `AssessmentRead` aliases        | Backend services and frontend generated lookups still use the OpenAPI names | Rename consumers in one contract migration                                                      |
| Legacy conflict-envelope fallback in `useAssessmentSubmission.ts` | May protect users during mixed-version deployment                           | Remove after telemetry or a deployment cutoff proves every backend returns the current envelope |

## Definition of done for the quick-win program

The quick-win queue is complete when:

- `vp install` leaves the working tree unchanged.
- `vp check` passes without warnings.
- `vp test list` and `vp test run` pass.
- `bun run build` passes without toolchain-resolution warnings.
- `bun run --cwd apps/api test` passes without the eight known warnings.
- `bun run check:contracts` passes on a clean tree.
- `bun run --cwd apps/web knip` has no actionable unused files or dependencies.
- GitHub workflows run those same commands with frozen, pinned environments.
- Generated API schema lookups preserve real types instead of returning `any`.
