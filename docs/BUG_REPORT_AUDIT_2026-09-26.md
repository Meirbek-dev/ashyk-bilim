# Application bug audit — 26 September 2026

Started 26 September; verification continued into 27 September (Asia/Qyzylorda).

**Second pass, 27 September:** added **10 independently reproduced findings, AUD-018–AUD-027**, bringing this report to **27 recorded findings**. Four first-pass findings were addressed during concurrent work. The new reproductions cover Redis propagation failure, database interleavings, real object storage, mocked-provider AI requests, and frontend recovery/query behavior. See “Second-pass findings” for evidence and rerun instructions.

## Scope and evidence

Initial audited checkout: branch `rewrite`, HEAD `9bced6b`, **including the staged changes already present when this audit began**. Legacy Python (`apps/api`) was excluded. This audit made no application implementation changes. The pre-existing staged [BUG_REPORT.md](BUG_REPORT.md) is preserved; corrections to its findings appear below.

**Concurrent changes:** another workflow advanced this shared checkout to `5e41925` during verification. Results below describe the code when each check ran, not a single frozen commit. Four findings were subsequently addressed in source: AUD-007 (`4b27d42`), AUD-008 (`c62c920`), AUD-011 (`fb5b60e`), and AUD-012 (`ad7882f`). Their original evidence is retained for traceability; they must not be counted as four still-open defects. The regenerated OpenAPI/client in `5e41925` does not update the failing Rust snapshot. A final web test rerun is recorded below. Changes made by that workflow were preserved.

This is an evidence-based audit, **not a claim that every bug has been found or every function has been manually verified**. Repository-wide checks and existing test suites cover substantially more code than the targeted manual review. A passing test is evidence for its assertions, not proof that the feature has no other defects. The source inventory included 1,161 non-generated Rust/TypeScript/SQL files under web source, server crates and migrations, excluding test directories/testkit. Generated contracts were checked separately.

Evidence labels used below:

- **Reproduced:** an existing or focused test demonstrated the failure.
- **SQL/Redis reproduced:** the actual predicates/command sequence were exercised on isolated temporary data; the complete application fault was not injected.
- **Code-confirmed:** an explicit failing path is present, with a reproduction procedure; not reproduced through the complete UI/service.

P1 = lost work, authorization/integrity failure, or broken background processing; P2 = functional or verification failure; P3 = misleading feedback/setup defect.

## Verification results

All commands were run through `rtk` (usually `rtk proxy`). Web commands ran in `apps/web`; Rust commands in `apps/server`. Rust used `CARGO_TARGET_DIR=C:\cargo-target\ashyq-server`, `CARGO_BUILD_JOBS=4`, and `SQLX_OFFLINE=true`. Local database credentials were loaded without printing them.

| Check | Result |
|---|---|
| `vp install` from repository root | Passed; no dependency changes |
| `vp env doctor` | All checks passed |
| `vp check` | Failed: 271 files require formatting; subsequent stages do not run |
| `vp lint --type-aware --type-check` without fixes | Failed independently: 137 error diagnostic lines and 198 warning diagnostic lines; includes duplicate diagnostics from overlapping React rules |
| `vp run typecheck` | Passed |
| `vp run check:error-codes` | Passed: all 39 codes in each of ru/kk/en |
| `vp run check:contracts` | Passed against the committed OpenAPI file; this does not validate that file against Rust's current generated document |
| `vp test` | 1,001 passed, 10 failed, one uncaught error; 230 test files |
| Package test script, `vp run test` | 1,010 passed, one failed; environment-loaded run isolates the profile ordering failure |
| `vp run build` | Passed, including production compilation and prerendering |
| Playwright configured suite | 94 passed, one failed, two skipped; Chromium journeys plus Firefox/WebKit/mobile Chrome smoke; 8 minutes |
| Focused audit reproducers | Four assertions failed as expected: overlapping autosave, hook reuse, failed-update rollback, failed-delete rollback |
| `just ci` | Formatting passed; Clippy failed at `crates/db/src/search.rs:53`; later CI stages were run separately where possible |
| `just deny` | Passed, with non-fatal dependency/license warnings |
| `just machete` | Passed |
| `just sqlx-check` | Passed against the local migrated Rust database |
| `just test-unit` | 166 passed, zero skipped |
| `just test` | Initial fail-fast run: 268 passed, one failed, 325 not run |
| Audit `test-all` recipe with `--no-fail-fast` | **594 run: 593 passed, one failed, zero skipped**; sole failure is the OpenAPI snapshot (AUD-017) |
| Final `vp test` after concurrent fixes | **1,016 passed across 231 files**, exit 0; verifies AUD-007 and AUD-011 no longer fail |
| Final `just clippy` after concurrent fixes | **Passed**, workspace/all targets with warnings denied; verifies AUD-012 is resolved |

First-pass final rerun logs: [web tests](audit-2026-09-26/web-tests-final.log), [Clippy](audit-2026-09-26/clippy-final.log). That pass recorded 17 findings: four addressed during concurrent work (three verified by these reruns, one inspected in source), and 13 not resolved or not reverified as resolved by that pass. These include verification/setup defects, not 17 distinct runtime bugs. Later second-pass results are separate below.

Playwright used the existing local Next.js application and Rust service (`localhost:3000`, `127.0.0.1:8000`). The service was not redeployed from this checkout during the audit; its exact build identity was not established. Test setup and journeys created local test users/courses/submissions, refreshed test auth files, and exercised role grants. AI browser cases use route mocks, not a real LLM. The two skipped cases require Judge0, which the setup probe could not reach.

## Confirmed application findings

### AUD-001 — P1 — Editor autosave sends concurrent writes with the same version

**Evidence: reproduced at hook level.** [useActivityAutosave.ts](../apps/web/src/hooks/useActivityAutosave.ts#L40), especially lines 44–51, 66–68 and 79–83; [EditorHeader.tsx](../apps/web/src/components/Objects/Editor/chrome/EditorHeader.tsx#L80).

`persistDraft` reads the last acknowledged version and starts a write without serializing with an earlier pending save. The debounce only postpones starting a request; it does not wait for one already in flight. Manual Save calls the same function directly, does not cancel the timer, and the header button remains enabled during saving.

**Reproduce:** hold the first update response open; type edit A and advance the 1,500 ms debounce; type edit B and advance another 1,500 ms before resolving A. Two writes are sent with version 1. The focused test expected one outstanding request and observed two. A manual Save while an autosave is pending is a second trigger.

**Impact:** the server's optimistic lock can reject the latest edit with 412 even with a single tab. Autosave then stops in `conflict`, requiring recovery/reload; the latest content has not been saved. Depending on response ordering, a later success from the older request can also overwrite the conflict indicator with `saved`.

**Fix direction:** serialize writes per activity, retain the newest pending payload, advance the version from each acknowledgement, and make manual flush consume/cancel the pending debounce. Do not remove the server's conflict check.

### AUD-002 — P2 — Failed curriculum mutations cannot restore their rollback snapshots

**Evidence: reproduced for activity update and delete; same defect code-confirmed for chapter update.** [activity.mutation.ts](../apps/web/src/features/courses/mutations/activity.mutation.ts#L28), lines 36–38, 64, 92–116; [chapter.mutation.ts](../apps/web/src/features/courses/mutations/chapter.mutation.ts#L69), lines 76–89.

`previousStructure` references the existing query data. The optimistic updater uses `Object.assign` on that structure's chapter/activity objects, mutating the snapshot itself. `onError` subsequently restores data that already contains the rejected mutation.

**Reproduce:** cache a course containing activity `a` named `original`; invoke update `onMutate` with `name: rejected`; invoke `onError`. The cache still says `rejected`. For delete, `onError` leaves `activities: []` instead of restoring `a`. Both focused tests failed with those exact values.

**Impact:** rejected edits/deletions remain displayed as if successful until a successful refetch repairs the structure. Offline/network failures can prolong this discrepancy. The server data is not deleted by this client defect.

**Fix direction:** make nested optimistic updates immutable; preserve the original snapshot unchanged. Cover chapter updates too.

### AUD-003 — P1 — Finished or panicked jobs can remain `running` forever

**Evidence: code-confirmed and SQL predicate reproduced.** [jobs/lib.rs](../apps/server/crates/jobs/src/lib.rs#L128), lines 146–149 and 199–225; [queue.rs](../apps/server/crates/db/src/queue.rs#L173), lines 177–179 and 265.

If `succeed`, `fail`, or `mark_dead` fails to persist, `execute` logs and returns. A panicked handler likewise only produces a logged `JoinError`. The worker nevertheless heartbeats **every database row** with its worker ID and `status = 'running'`, including these jobs that no task is executing. The reaper only recovers stale heartbeats.

**Reproduce:** let a handler finish, fail its completion UPDATE once, then restore database connectivity while leaving the worker alive. Its next heartbeat renews the abandoned row indefinitely. The isolated SQL test started with a ten-minute-old abandoned row; the heartbeat predicate made it ineligible for the 60-second reaper again.

**Impact:** AI/background work or progress jobs can remain stuck until worker restart. Live-job deduplication also suppresses replacement jobs with the same dedupe key.

**Fix direction:** heartbeat only the IDs of actually executing tasks; retry completion persistence or stop renewing a job whose task has ended. Catch/report task failure with its job identity.

### AUD-004 — P1 — A stale worker can complete or requeue another worker's claim

**Evidence: code-confirmed and SQL predicate reproduced.** [queue.rs](../apps/server/crates/db/src/queue.rs#L205), also `mark_dead` and `fail` at lines 187–250; `ClaimedJob` at line 95.

Resolution UPDATEs match only job ID and `status = 'running'`; they do not match the worker/claim generation. After the reaper recovers a slow/disconnected worker A's job and worker B claims it, a late result from A can change B's current claim to `succeeded`, `queued`, or `dead`.

**Reproduce:** claim with A; make its heartbeat stale; reap and reclaim with B; then deliver A's late success/failure. The isolated SQL test set `locked_by = worker-B`, `attempts = 2`; the current success predicate still changed that row to `succeeded` and cleared B's ownership.

**Impact:** the durable queue state no longer corresponds to the active execution. A stale failure can create a further concurrent retry or incorrectly dead-letter work.

**Fix direction:** return a claim token/generation from `claim`, require it in all completion/failure UPDATEs, and treat zero updated rows as a lost lease. This complements, rather than replaces, idempotent job handlers.

### AUD-005 — P2 — SSE disconnect can erase a newly acquired connection counter

**Evidence: Redis command sequence reproduced.** [events/mod.rs](../apps/server/crates/domain/src/events/mod.rs#L99), lines 99–102; acquisition at lines 142–160.

Release does `DECR`, awaits it, and separately `DEL`s when the returned value is zero. A new connection can `INCR` the same key between those commands; the old disconnect then deletes the new connection's count.

**Reproduce:** isolated key starts at 1; old disconnect `DECR` returns 0; new connection `INCR` returns 1 and sets expiry; old disconnect `DEL`; `EXISTS` returns 0 although the new connection is live. This exact sequence was executed on an audit-only Redis key.

**Impact:** active streams are undercounted and the intended five-connection cap can be exceeded. Later drops may also create negative counts.

**Fix direction:** make conditional decrement/delete atomic, and account for expiry/late releases (per-connection leases avoid deleting or decrementing a replacement generation).

### AUD-006 — P2 — Retrying SSE clients prevent leaked slots from expiring

**Evidence: code-confirmed.** [events/mod.rs](../apps/server/crates/domain/src/events/mod.rs#L140), lines 145–155.

Every acquisition refreshes the counter's TTL to 3,600 seconds **before** checking whether the connection limit was exceeded. A rejected reconnect decrements the count back but retains the refreshed TTL.

**Reproduce:** leave the user's counter at 5 after failed releases; attempt reconnect at intervals shorter than one hour. Each attempt goes 5 → 6 → 5, returns no slot, and restarts the one-hour expiry. No live connections are necessary.

**Impact:** the previous report's claim that lost decrements self-heal within an hour is false for reconnecting clients. Streaming may remain unavailable indefinitely while reconnect attempts continue.

**Fix direction:** use expiring per-connection leases or another recovery mechanism that rejected attempts cannot extend indefinitely.

### AUD-007 — P2 — Profile courses are not ordered by latest update

**Evidence: existing test reproduced in both full web test runs.** [client.ts](../apps/web/src/lib/users/client.ts#L76); [user-courses-order.test.ts](../apps/web/src/tests/users/user-courses-order.test.ts#L20). Corresponds to existing BUG-221.

**Later status: resolved and verified.** Concurrent commit `4b27d42` added descending update-time sorting. The final full web suite passes; this finding describes the earlier observed failure.

`getCoursesByUser` collects the API's ID-ordered pages and maps them without sorting. With updated timestamps 100/300/200, expected order is `old-fresh, mid, new-stale`; observed order is `new-stale, old-fresh, mid`.

**Impact:** profile courses do not follow the required most-recently-updated ordering. **Fix direction:** sort the collected list by update timestamp, with a deterministic tie-breaker, or implement matching server pagination/order.

### AUD-008 — P3 — Failed outline fetch reports zero failed chapters

**Evidence: code-confirmed.** [useCreateCourseMutation.ts](../apps/web/src/features/courses/create/useCreateCourseMutation.ts#L69), lines 69–77; [CourseCreateForm.tsx](../apps/web/src/features/courses/create/CourseCreateForm.tsx#L40). Refines existing BUG-225.

**Later status:** concurrent commit `c62c920` added `sourceFetchFailed` and a specific warning. The misleading warning is addressed in source; this audit did not manually replay that revised UI.

If the source-course request rejects after the destination is created, the result is `status: partial`, `importedChapterCount: 0`, `failedChapterCount: 0`. The caller **does** show a warning toast, so the previous claim of no warning is inaccurate; its counts still misleadingly claim no failures.

**Reproduce:** choose Copy outline, allow course creation, fail the source metadata GET. **Expected:** explicit source-fetch failure and a way to retry/recover. **Actual:** empty created course and a partial-import warning with zero successes and zero failures.

### AUD-015 — P1 — Submission finalization overwrites concurrently saved answers and violation counts

**Evidence: code-confirmed and SQL predicate reproduced.** [grading/submissions.rs](../apps/server/crates/domain/src/grading/submissions.rs#L753), lines 756–761, 865–871 and 899–920; [db/submissions.rs](../apps/server/crates/db/src/submissions.rs#L355), lines 358–365.

The domain checks `expected_draft_version` against a previously read row, then awaits context/rate-limit/grading work. `persist_submit` subsequently updates the row with only `WHERE id = $1 AND status = 'draft'`. It does not compare `draft_version` again. The final write also assigns the previously read/computed `violation_count`, although `record_violation` can increment it while grading is in progress. The route's idempotency guard does not serialize draft saves or violation reports with submit.

**Reproduce:** submit version 1 with an old answer and zero violations; delay grading (e.g. Judge0). A second tab successfully saves a new answer as version 2, and/or a violation report increments the stored count. Resume submit. The current UPDATE can publish the old answer while leaving `draft_version = 2`, and reset the violation count to zero. An isolated SQL reproduction produced exactly that final row.

**Impact:** an acknowledged draft change can be lost despite the advertised optimistic-lock contract. A violation accepted by the server can disappear from the count and the verdict may ignore its threshold. This is a timing window, not a claim that every submission loses data.

**Fix direction:** atomically claim/transition the draft using its expected version, or revalidate under an appropriate lock before commit. Make the final verdict/count consistent with accepted violation events; merely retaining the larger count after grading would not repair an already-computed wrong verdict.

### AUD-016 — P2 — Full-list consumers silently discard everything after page 20

**Evidence: reproduced by importing the actual helper; consumers code-confirmed.** [contract.ts](../apps/web/src/lib/api/contract.ts#L17), [users.query.ts](../apps/web/src/features/users/queries/users.query.ts#L33), and [discussions.ts](../apps/web/src/services/courses/discussions.ts#L50).

`collectPages` returns its accumulated array after 20 pages even when the last page still has `next_cursor`. It does not return that cursor or a truncation flag. Callers describe their results as every usergroup/all members and expose no continuation through this helper. At page size 100, user/group selectors cannot see entries beyond the first 2,000; discussions default to 50 per page and lose posts after the first 1,000. The profile-course fetch has the same 2,000-item ceiling.

**Reproduce:** supply 21 linked one-item pages to the actual helper. Node returned `{fetchedPages:20, returned:20, expected:21}`. This limit is documented inside the helper but is not surfaced to its full-list consumers/users.

**Fix direction:** use server-side search/paging for selectors and discussions, or follow all valid cursors with cycle detection. If a hard cap is intentional, expose truncation and a continuation path rather than presenting the array as complete.

## Verification and setup defects

### AUD-009 — P2 — Formatting gate fails on 271 files

**Reproduced:** `vp check` in `apps/web` exits 1 at formatting. This is existing BUG-220. It does not establish 271 functional bugs. The checkout was dirty before the audit, so attribution to a particular change is not established.

### AUD-010 — P2 — Lint also fails after bypassing the formatting blocker

**Reproduced:** `vp lint --type-aware --type-check` exits 1, with 137 error diagnostic lines and 198 warning diagnostic lines. The complete output is saved in [web-lint.log](audit-2026-09-26/web-lint.log). Examples include `FileSubmissionReviewWorkspace.tsx:244` (effect state update), `useAssessmentSubmission.ts:648` (render-time ref access), and unbound-method diagnostics at service/parser call sites. These diagnostics require triage; this report does **not** assert that every lint diagnostic is a runtime bug. TypeScript's separate typecheck and the production build pass.

### AUD-011 — P2 — Documented built-in test command skips required environment setup

**Later status: resolved and verified.** Concurrent commit `fb5b60e` added public configuration defaults to test setup. Final plain `vp test` passes all 1,016 tests. Original evidence follows.

**Reproduced:** plain `vp test` has 10 failures plus one uncaught exception. Nine failures are caused by missing public site/API configuration; the tenth is AUD-007. `vp run test`, through [run-vitest.mjs](../apps/web/scripts/run-vitest.mjs#L13), loads `.env`/`.env.local` and reduces the run to one failure (AUD-007).

**Impact:** the repository's prescribed command and its package test script have different behavior. Tests depending on a developer's local configuration are not hermetic. **Fix direction:** set safe test defaults/mock public configuration in test setup and align documentation/CI with the actual runner. Existing BUG-222 says eight environment failures; the actual number is nine (3 + 5 + 1).

### AUD-012 — P2 — Rust CI is blocked by a denied doc-comment lint

**Later status: resolved and verified.** Concurrent commit `ad7882f` split the offending summary. The final complete `just clippy` check passed with warnings denied.

**Reproduced:** `just ci` with offline SQLx passes formatting, then Clippy rejects [search.rs](../apps/server/crates/db/src/search.rs#L53), `word_patterns`: `clippy::too_long_first_doc_paragraph`. Corresponds to existing BUG-003. Fix the paragraph layout without suppressing the lint. This audit did not alter implementation to make the gate green.

### AUD-013 — P2 — Role-assignment E2E selector is ambiguous

**Reproduced:** [AdminUsersPage.ts](../apps/web/e2e/page-objects/AdminUsersPage.ts#L54) uses `new RegExp(userEmail, 'i')` without escaping or boundaries. The seeded stack contains both `teacher@ashyq.local` and `proxy-teacher@ashyq.local`; both match. Playwright stops with a strict-mode violation before assigning a role.

**Impact:** the suite fails on valid user data and does not verify the assignment action. The UI correctly showed two distinct options. **Fix direction:** select the exact email/option identity and escape any regex literal input; scope to the dialog.

### AUD-014 — P3 — Checked-in E2E default still targets the legacy API

**Code-confirmed:** [e2e/.env.test](../apps/web/e2e/.env.test#L12) sets `E2E_API_URL=http://localhost:1338/api/v1`, although global setup calls v2 routes/payloads. `playwright.config.ts` loads this file; its v2 default is therefore not used on a fresh setup without an override.

**Reproduce:** use the checked-in test env without `.env.test.local`/shell override against a Rust-only stack. Setup sends `/auth/login` to the legacy endpoint and cannot establish the intended sessions. The audit machine's `.env.test.local` masks this defect with port 8000 and `/api/v2`.

### AUD-017 — P2 — Rust OpenAPI snapshot does not match the checked-out API

**Reproduced:** `ab-api::openapi::openapi_document_snapshot` fails at `crates/api/tests/openapi.rs:11`. The diff includes the public-user response changing from `UserHit` to `PublicProfile` and route/schema additions. The first full run stopped after 268 passed and one failed, leaving 325 tests unrun; the follow-up audit runner disables fail-fast.

The follow-up completed all 594 tests: 593 passed and only this snapshot failed. The complete output is [rust-tests.log](audit-2026-09-26/rust-tests.log). The audit-only recipe is [justfile](audit-2026-09-26/justfile); run `just --justfile docs/audit-2026-09-26/justfile test-all` from the repository root with the database/build environment described above.

**Impact:** the Rust test gate is red and the committed contract/snapshot needs review against the current API. A passing frontend contract check only confirms generation from its existing input, not agreement with Rust. This checkout already contained staged user API changes, so the introducing commit is not established. Review/export the intended API and regenerate consumers/snapshot together; do not blindly accept the diff. Corresponds to existing BUG-002.

## Second-pass findings — 27 September

The shared checkout advanced from `5e41925` to `11c5a06` during this pass. Other work also modified `AccessManagementTab.tsx` and its test; those changes were preserved. These findings were reproduced against the checked-out implementations, not inferred from the legacy backend. No application fixes were made by this audit.

**Verification:** seven Rust integration/domain tests failed on their intended correctness assertions, and three frontend assertions failed on their intended behavior. The backend tests use fresh migrated databases, the real router/session store where applicable, real local Redis/RustFS, and a fake LLM. Temporary blockers and the audit upload object were cleaned up. One initial moderation test had an invalid fixture; that fixture was corrected before the successful reproductions below. Compilation/fixture failures are not counted as app bugs.

Evidence: [Rust reproducers](audit-2026-09-26/audit_second_pass.rs), [Rust results](audit-2026-09-26/second-pass-rust.log), [role UI reproducer](audit-2026-09-26/role-recovery.test.tsx), [review query reproducers](audit-2026-09-26/review-query.test.ts), [frontend results](audit-2026-09-26/second-pass-web.log).

### AUD-018 — P1 — Failed role revocation propagation leaves usable privileges and retry cannot repair it

**Evidence: reproduced through HTTP with an isolated Redis fault.** [rbac_admin.rs](../apps/server/crates/domain/src/identity/rbac_admin.rs#L103), especially the membership check, commit at line 130, and subsequent `propagate`; [sessions.rs](../apps/server/crates/domain/src/identity/sessions.rs), `get_and_touch` and `update_user_sessions`.

Role removal commits in Postgres before rewriting Redis sessions. If the rewrite fails, existing sessions retain their permissions. Request authentication trusts the session rather than comparing it with Postgres. Retrying removal returns 404 because the assignment has already disappeared, before reaching propagation again. The detached handler protects against client disconnection, but not a failed Redis command or process loss.

**Reproduction:** create an instructor and a live session with `course:create:platform`; inject a failing epoch `INCR` for that test user only; DELETE their instructor role; remove the injected fault and retry DELETE. The first response is 500, the retry is 404, the session still contains the revoked grant, and creating a course with that session succeeds (201). The injected invalid epoch is a test mechanism for the fallible propagation path, not a claim that normal users can write Redis keys.

**Impact:** a persisted permission revocation can leave the revoked action usable for the remaining session lifetime. Custom-role deletion has the same commit-before-propagation pattern and loses the role/member lookup needed by a retry.

**Fix direction:** persist a recoverable revocation/propagation obligation with the role change and fence stale sessions until it is applied. Make retries repair pending propagation even when the database assignment is already absent. Returning 500 alone does not undo the committed revocation or revoke the old session.

### AUD-019 — P1 — An owner edit can undo a moderator's concurrent hide

**Evidence: reproduced through HTTP with deterministic row-lock ordering.** [discussions.rs](../apps/server/crates/domain/src/community/discussions.rs#L303); [database update](../apps/server/crates/db/src/discussions.rs#L195).

For a non-moderator, the domain permits an explicit status when it equals the previously read status. It then forwards that status to an unconditional UPDATE. Between the read and write, moderation can change the row to hidden; the owner's already-authorized write sets it back to active.

**Reproduction:** hold the discussion row lock, start an owner PATCH with `{content: "Edited", status: "active"}`, wait until its UPDATE is blocked, hide the row in the lock-holding transaction, then commit. The owner request succeeds and the final status is **active**, although the owner has no moderation grant. The test waits for the actual PostgreSQL lock state rather than relying on a scheduling delay.

**Impact:** concurrent editing bypasses the rule that only moderators can restore hidden content.

**Fix direction:** non-moderators must never write the status column, including a same-as-before value; reject or omit it. Alternatively enforce the permission/state check under the same lock as the write.

### AUD-020 — P2 — Failed role replacement removes the old role and traps the dialog in failed retries

**Evidence: reproduced against the real React component with a stateful service mock.** [RolesUpdate.tsx](../apps/web/src/components/Objects/Modals/Dash/Users/RolesUpdate.tsx), `handleSubmit`.

The dialog first removes `alreadyAssignedRole`, then assigns the new role. If assignment fails, it neither restores the old role nor refreshes its notion of the user's roles. On retry it tries removing the old role again. The API's 404 for an absent assignment aborts the retry before the new grant request.

**Reproduction:** start with role `user`; choose `instructor`; let DELETE succeed and fail POST once; click Update again after the error. The mock backend remains without either role, and the second submit fails on the missing old assignment. This is a different failure from AUD-018: both service endpoints can be healthy on retry and the UI still cannot recover.

**Fix direction:** provide an atomic role replacement operation, or implement explicit partial-success recovery with fresh state and safe compensation. Invalidate displayed role data on partial failure.

### AUD-021 — P1 — AI terminal success is committed before its result and accounting

**Evidence: reproduced with a real AI route and a blocked artifact INSERT.** [runs.rs](../apps/server/crates/domain/src/ai/runs.rs#L347), artifact insertion at 360, ledger update at 392, worker terminal short-circuit at 499.

`finish_run` commits `status = succeeded`, then separately inserts the artifact, evidence, token ledger, and finished event. These steps do not share a transaction.

**Reproduction:** take a PostgreSQL SHARE lock on `ai_artifacts`, execute a study-companion request with a valid fake-provider response, and wait until its artifact INSERT blocks. A separate read sees **one succeeded run with no artifact**. Releasing the lock allows the request to finish normally. Thus this is an observable partial commit, not merely a guessed process-failure window.

**Impact:** status consumers can observe success before the result exists. If the process dies in that interval, a queued retry sees a terminal run and returns without repairing the artifact/accounting. The process-crash consequence is code-confirmed; the test demonstrates the durable intermediate state without killing a service. A normally caught error may mark the run failed, so not every insertion error leaves a succeeded row.

**Fix direction:** commit the terminal state, artifact, evidence, accounting, and durable completion event together; publish external notifications after commit. Include feature-specific result records in the completion boundary where required.

### AUD-022 — P2 — AI accounting discards the provider's actual input-token usage

**Evidence: reproduced through the study-companion HTTP endpoint.** [agents/mod.rs](../apps/server/crates/domain/src/ai/agents/mod.rs#L178); [runs.rs](../apps/server/crates/domain/src/ai/runs.rs#L392).

The provider returns usage for both prompt and completion. The pipeline forwards the actual output count but uses `exec.input_tokens`, the preflight estimate, for input accounting. It never replaces that estimate with `outcome.usage.input_tokens`. The Q&A finish call similarly forwards its estimate.

**Reproduction:** the test provider reports 42 input and 7 output tokens. The final ledger contains **115 input and 7 output** in the saved run (the estimate varies slightly with generated course IDs). Earlier repetition produced 113 input, still against the same authoritative 42.

**Impact:** usage reports and remaining monthly allowance can overcount or undercount paid input, especially when the responding model differs from the estimation model.

**Fix direction:** record reported input and output usage, estimating only missing values; keep estimated admission costs distinct from settled usage.

### AUD-023 — P2 — Monthly AI budget can be spent repeatedly by in-flight requests

**Evidence: reproduced against the real `TokenBudget` and ledger functions.** [budget.rs](../apps/server/crates/domain/src/ai/budget.rs#L80).

Admission reads completed usage and compares it with this request's estimated input. It makes no reservation. Multiple requests accepted before either completes all see the same remaining balance. Output costs are also absent from admission.

**Reproduction:** configure budget 100 and record usage 99; admit two one-token requests before recording either completion. Both checks succeed; settling both leaves **101 used against a budget of 100**, even with zero output tokens. This controlled ordering is the same interleaving as concurrent requests and needs no live provider.

**Impact:** the configured platform-wide cap is not enforced under concurrency. Per-user hourly limits do not serialize platform-wide spending.

**Fix direction:** atomically reserve input plus a bounded output allowance at admission, settle against actual usage, and release abandoned reservations with a recoverable lifecycle.

### AUD-024 — P2 — Study-companion request limit excludes instructions sent to the model

**Evidence: reproduced through HTTP and inspection of the received fake-provider request.** [study_companion.rs](../apps/server/crates/domain/src/ai/agents/study_companion.rs#L79), also queued path at 183 and final prompt construction at 220; [agents/mod.rs](../apps/server/crates/domain/src/ai/agents/mod.rs#L119).

Admission estimates only the question and clipped course context. The actual request adds the system prompt and mode/language/question wrappers afterwards. This differs from the newer Q&A context-fitting path, which includes its instructions and history.

**Reproduction:** set `max_tokens_per_request = 200`; submit a short study question. The API accepts it and the captured model messages contain **443 estimated input tokens**, measured with the application's own estimator. No provider token-count discrepancy is needed to reproduce this bug.

**Impact:** the request-size policy can be exceeded; contexts near the configured/model limit may be accepted locally but rejected upstream. This is distinct from AUD-022's post-completion accounting and AUD-023's aggregate concurrency.

**Fix direction:** assemble the full messages before estimating/fitting; use the same budgeted payload for the actual provider call. Audit the other structured agents for the same construction order.

### AUD-025 — P1 — A finalized upload remains replaceable through its original signed PUT URL

**Evidence: reproduced with the real upload/finalize/download routes and RustFS.** [storage.rs](../apps/server/crates/clients/src/storage.rs#L93); [uploads.rs](../apps/server/crates/domain/src/files/uploads.rs), `create`/`finalize`; [file-submission validation](../apps/server/crates/domain/src/files/submissions.rs#L952).

The 15-minute PUT signature binds the key and MIME type, but does not enforce a one-time write or pin content. Finalization verifies the current object and records its size; it leaves that same object key writable with the still-valid URL. Submission validation later trusts the finalized ledger row, and downloads resolve the mutable key.

**Reproduction:** create a `file-submission` upload, PUT `first`, finalize successfully, then PUT `replacement after finalization` to the exact original URL with the same MIME type. Replay returns **200**; the application download serves the replacement. The test deletes its object afterwards. No additional signed URL or application mutation endpoint is needed.

**Impact:** finalized bytes and recorded metadata can diverge. A submitted file can be changed during the remaining URL lifetime without the submission version changing; later size-policy checks see the old size. The test proves finalized-object replacement; a complete graded-submission replay was not separately exercised.

**Fix direction:** finalize into an immutable destination/version inaccessible to the upload URL, or require a storage-enforced create-only PUT. Pin the object/version/checksum consumed by submissions; shortening the URL lifetime alone does not remove the race.

### AUD-026 — P2 — Grading review's score and attempt sort controls do nothing

**Evidence: reproduced against the real query function, with API data and row mapping mocked.** [grading.query.ts](../apps/web/src/features/grading/queries/grading.query.ts#L52); [SubmissionList.tsx](../apps/web/src/features/grading/review/components/SubmissionList.tsx#L70); [useSubmissions.ts](../apps/web/src/hooks/useSubmissions.ts).

The UI offers submitted-time, final-score and attempt-number ordering and passes `sortBy`/`sortDir` into the query. `fetchSubmissionsPage` uses neither field, and the hook/component applies no local ordering. Changing the selector changes query identity/URL state but still fetches and displays the same server ordering. The Rust `ReviewQuery` currently has no sort parameters either.

**Reproduction:** return rows with scores 10 then 90; request descending `final_score`. Actual IDs remain `low, high`; expected `high, low`.

**Fix direction:** implement supported sorting with consistent cursor semantics, or remove unsupported controls. Sorting only a fetched page would not correctly sort a multi-page queue.

### AUD-027 — P2 — A shrinking grading queue repeats its last page and invents totals

**Evidence: reproduced against the real query function.** [grading.query.ts](../apps/web/src/features/grading/queries/grading.query.ts#L64).

The cursor walk stops early when it reaches the end, but calculates `seenBefore`, `page`, and `pages` from the originally requested page rather than the page actually reached. This can happen when grading/removing pending submissions shrinks the queue while a reviewer is on a later page; refreshing does not necessarily reset their page.

**Reproduction:** request page 3 at size 20 while the API returns one row and no next cursor on the first request. The result returns that first-page row as page 3 and reports **41 submissions / 3 pages**, although only one exists. Different out-of-range pages can display the same final rows with different fabricated totals.

**Fix direction:** track the actual traversal/page count, clamp/reset out-of-range selection, and distinguish a known total from a lower bound while more cursors remain.

### Rerunning the second-pass evidence

The saved assertions intentionally express the expected correct behavior and fail on the audited code. They are kept outside normal test discovery so this report does not make the ordinary suite red.

1. Copy `audit_second_pass.rs` to `apps/server/crates/api/tests/audit_second_pass.rs`. With the same local services and database/build environment as the first pass, run `rtk proxy just --justfile docs/audit-2026-09-26/justfile test-second-pass` from the repository root. Remove the temporary copy afterwards.
2. Copy `role-recovery.test.tsx` and `review-query.test.ts` to `apps/web/src/tests/` and run `rtk proxy vp test src/tests/role-recovery.test.tsx src/tests/review-query.test.ts` from `apps/web`. Remove the temporary copies afterwards.

This pass does not reclassify the earlier full-suite results as a fresh all-feature run. It adds focused evidence where ordinary happy-path suites did not exercise the failure or interleaving.

## Additional evidence requiring qualification

- **Pending autosave across hook reuse:** the second test in [autosave-race.test.ts](audit-2026-09-26/autosave-race.test.ts) queues lesson A's payload, rerenders the hook with lesson B, and observes the old payload sent to B. `useDebouncedCallback` retains arguments but invokes the latest `callbackRef` (`useDebounce.ts:24–40`). This is reproduced hook behavior. Whether a particular Next route transition remounts the editor must be checked before calling it a confirmed cross-lesson production overwrite. Key/cancel pending work by entity identity.
- **Upload reaper retry gap:** `files/uploads.rs::reap_expired` deletes database rows before object deletion and logs storage-delete errors without retrying. This is explicitly documented as a trade-off in the source. Failed deletes leave orphaned objects; no storage fault injection was performed here. Track as an operational retention/cost limitation, not newly proven user data loss.

## Corrections to the pre-existing report

| Existing ID | Current disposition |
|---|---|
| BUG-002 | Reproduced; see AUD-017 |
| BUG-003 / BUG-220 / BUG-221 | Reproduced; see AUD-012 / AUD-009 / AUD-007 |
| BUG-222 | Reproduced for `vp test`; nine environment-dependent failures, resolved by the existing package runner on this machine |
| BUG-223 | Not established as stated. This file workspace does not contain the claimed autosave, and background reads alone do not bump server versions. A 412 after another tab saves is expected optimistic-lock protection. Blindly taking the newest version could overwrite another tab's work. Do not apply the previous recommended fix without an actual lost-work reproduction |
| BUG-224 | Withdraw as a current app bug: the query parses `LearnerCourseState` with Zod, whose `outline` is a required array. `outline: null` is rejected before this component. No supported producer of the alleged partial object was found |
| BUG-225 | Warning exists; misleading zero failure count remains (AUD-008) |
| BUG-226 | Minor label issue remains code-visible: extensionless filenames are used as a type label. No evidence of incorrect acceptance/rejection; preserve as P3 copy issue |
| BUG-227 | Lost release is documented, but the one-hour recovery bound is incorrect under reconnects (AUD-006); a separate atomicity defect is AUD-005 |

## Coverage and remaining gaps

| Area | Evidence obtained | Limits |
|---|---|---|
| Auth, registration, roles, users | Unit suite, browser journeys, targeted session/redirect/middleware/profile review | Real external Google sign-in, email delivery and every MFA/browser variant not exercised |
| Catalog, curriculum, editor, collections, profiles | Typecheck/build, unit suite, authoring browser flow, focused mutation/rollback tests and service review | All editor block combinations and every concurrent navigation path not manually exercised |
| Assessments, submissions, files, grading, certificates, trail | Unit suite and browser flow through file upload, exam submission, grading, release, certificate availability; targeted locking/projection/API review | Judge0 browser cases skipped; all deadline/concurrency combinations require further tests |
| Queue, jobs, SSE | Direct source review, isolated SQL/Redis reproductions | No complete process/network fault-injection or long-running load test |
| AI and remediation | Source review, browser UI tests using mocks | No live LLM correctness, billing, provider failover or safety evaluation |
| Analytics, gamification, community, search | Existing suites, targeted service/query/export review | Not an exhaustive independent recalculation of every metric or moderation/concurrency path |
| ETL, migrations, deployment | Rust build/tests and targeted pipeline/config inspection | No destructive migration/cutover rehearsal; legacy Python was not inspected |

The saved reproducer files intentionally assert the **correct** behavior and currently fail. They are stored under `docs/audit-2026-09-26`, outside the regular test discovery path. To rerun, copy them to `apps/web/src/tests/` and run `rtk proxy vp test src/tests/autosave-race.test.ts src/tests/cache-rollback.test.ts` from `apps/web`, then remove those temporary copies. They are audit evidence, not fixes.

This report does not certify complete line/function coverage, complete feature coverage, or a bug-free application. The unresolved checks and external-service gaps above remain work to do.
