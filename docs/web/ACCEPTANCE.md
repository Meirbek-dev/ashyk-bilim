# Stage 2 acceptance (spec section 13), state on 2026-10-04

Source: `docs/MODERNIZATION-STAGE-2.md` section 13. "Now" = checked on `main` before cutover; "Cutover" =
can only be checked at or after `docs/STAGE-2-CUTOVER.md` section 2 or phase 9 (old web deleted, `web-2`
renamed). Evidence is the CI run named below or the report in brackets.

| # | Item | Now | Cutover / phase 9 |
| --- | --- | --- | --- |
| 1 | clone -> `just dev-up` -> `just web dev`, same-origin | Same-origin: `vp dev` proxies `/api/v2`, buckets and `/content`; the prod stand (nginx) too | `just web` still runs `apps/web`; it points at the new web after the rename |
| 2 | `vp run verify` and e2e green in CI; 0 warnings, 0 skipped; allowlist with reasons | CI_RESULT; `vp run verify` green locally; allowlist: 6 `i18nSameAsRu` entries, all with a reason, no suppressions; `@judge0` specs are filtered out by `--grep-invert` in CI, not skipped | `@judge0` specs: full run on the local stand before cutover (precondition 1.2) |
| 3 | image without build args; the e2e image runs in prod | `ashyq-web-2` builds with no `build-args` (ci.yaml sets them for `web` only); `web2-e2e` runs the CI image | Same digest in prod: `publish` on `release/stage2` retags it; checked in cutover 1.1 |
| 4 | `docker compose exec web env`: only `PUBLIC_ORIGIN`, `INTERNAL_API_URL` + system | The new web reads only those two (`env.server.ts`), plus `PORT`/`HOST` with defaults (`serve.ts`) | `compose.prod.yaml` still passes `NEXT_*` and `APP_URL` for the old web: removed in phase 9 |
| 5 | every OpenAPI operation used by the web (G-07); every `B-` has a test (G-10) | G-07 and G-10 enforced by `gates.ts` (green); 26 operations without a consumer listed in `gates/server-removals.json` and `apps/server/docs/phase9-removals.md` | Phase 9 deletes those operations from the server; then the removals list is empty |
| 6 | G-14 on a fresh prod copy; G-15 on all 63 themes | G-14 148/148 documents, 1051/1051 texts on the 2026-10-04 restore (P-8); G-15 64/64 (W-2) | G-14 again on the newest backup right before cutover (precondition 1.3) |
| 7 | role matrix on all 5.3 routes in ru; kk/en smoke; all routes at 390 px | `access.spec.ts` (matrix from `access.ts`, kk/en smoke) and the 390 px overflow check in the shared fixture, in `web2-e2e` | Prod browser pass per role at 390 px and desktop (cutover 2.5) |
| 8 | budgets 6.2; CSP with nonce; console clean on all e2e routes | Chunk budgets in `bun run build` (initial JS 174.7 KB); the fixture fails a document without CSP, any console error or CSP violation | Prod `/` carries `content-security-policy` with a nonce (cutover 2.5); 7-day `/_client-error` watch (2.7) |
| 9 | the `git grep` over `apps/web`, contract, compose, infra, CI, justfile is empty | Not yet: `apps/web` (582 files), `web-2` in compose/CI/justfile, legacy names in the contract | Only after phase 9: old web deleted, `web-2` renamed, legacy operations removed |
| 10 | no old web in the repo; no operation without a consumer or old names; `main` green | `main` green (CI_RESULT) | Old web deletion and contract cleanup are phase 9 (after the 7-day window, owner decision) |

Open before cutover: the `@judge0` run on the local stand, G-14 on the newest backup, the owner's window.
