# Stage 2 acceptance (spec section 13), state on 2026-10-04

Source: `docs/archive/MODERNIZATION-STAGE-2.md` section 13. "Now" = checked on `main` before cutover; "Cutover" =
at or after the cutover (2026-10-04, `docs/STAGE-2-CUTOVER.md`) and phase 9. The web was `apps/web-2` / `ashyq-web-2`
(CI jobs `web2-*`) until the rename in phase 9.4. Evidence is the CI run named below or the report in brackets.

| # | Item | Now | Cutover / phase 9 |
| --- | --- | --- | --- |
| 1 | clone -> `just dev-up` -> `just web dev`, same-origin | Same-origin: `vp dev` proxies `/api/v2`, buckets and `/content`; the prod stand (nginx) too | Done (phase 9.4): `apps/web` is the new web; `just web dev` runs it |
| 2 | `vp run verify` and e2e green in CI; 0 warnings, 0 skipped; allowlist with reasons | CI run 37178939498 (7151581): every job green, `web2-e2e` 671 passed, 0 failed, 0 retries; `vp run verify` green locally; allowlist: 6 `i18nSameAsRu` entries, all with a reason, no suppressions; `@judge0` specs are filtered out by `--grep-invert` in CI, not skipped | `@judge0` specs: done on 2026-10-04 on the local stand (production build behind `prod-stand.ts`, API image built from 81f6241, Judge0 1.13.1 on rootless podman): `e2e/specs/code-arena*` 17/17, the `@judge0` spec included (FIN-2) |
| 3 | image without build args; the e2e image runs in prod | `ashyq-web-2` builds with no `build-args` (ci.yaml sets them for `web` only); `web2-e2e` runs the CI image | Done: prod runs `ashyq-web-2:9c88be2c`, published by `release/stage2` from the e2e-tested `ci-` image. Since phase 9.4 `main` publishes `ashyq-web` the same way |
| 4 | `docker compose exec web env`: only `PUBLIC_ORIGIN`, `INTERNAL_API_URL` + system | The new web reads only those two (`env.server.ts`), plus `PORT`/`HOST` with defaults (`serve.ts`) | Done (phase 9.2): `compose.prod.yaml` passes exactly those two. Prod check `dc exec -T web env` after the first release with it |
| 5 | every OpenAPI operation used by the web (G-07); every `B-` has a test (G-10) | G-07 and G-10 enforced by `gates.ts` (green); 26 operations without a consumer listed in `gates/server-removals.json` and `apps/server/docs/phase9-removals.md` | Phase 9 deletes those operations from the server; then the removals list is empty |
| 6 | G-14 on a fresh prod copy; G-15 on all 63 themes | G-14 148/148 documents, 1051/1051 texts on the 2026-10-04 restore (P-8); G-15 64/64 (W-2) | Done: G-14 on a scratch copy of the 2026-10-04 prod database, 128/128 documents, 736/736 texts, 0 losses before and after the migrations |
| 7 | role matrix on all 5.3 routes in ru; kk/en smoke; all routes at 390 px | `access.spec.ts` (matrix from `access.ts`, kk/en smoke) and the 390 px overflow check in the shared fixture, in `web2-e2e` | Prod browser pass per role at 390 px and desktop (cutover 2.5) |
| 8 | budgets 6.2; CSP with nonce; console clean on all e2e routes | Chunk budgets in `bun run build` (initial JS 174.7 KB); the fixture fails a document without CSP, any console error or CSP violation | Prod `/` carries `content-security-policy` with a nonce (cutover 2.5); 7-day `/_client-error` watch (2.7) |
| 9 | the `git grep` over `apps/web`, contract, compose, infra, CI, justfile is empty | Not yet: `apps/web` (582 files), `web-2` in compose/CI/justfile, legacy names in the contract | Phase 9.1/9.2/9.4 done: empty over `apps/web`, compose, `infra/`, CI, justfile. Contract part (`course_uuid`, `usergroups`, `/trail`, `can_update` in `openapi.v2.json`) waits for S-12 (9.3) |
| 10 | no old web in the repo; no operation without a consumer or old names; `main` green | `main` green (run 37178939498; `publish` runs on `release/**` only) | Old web deleted and `main` publishes again (phase 9.1); contract cleanup is S-12 (9.3), after the 7-day window |

Dependency bump b707d68 (server `Cargo.*`, web-2 `package.json`/`bun.lock`): covered by CI run 37188033446 (3967047, includes b1d86df and 81f6241), every
job on top of it incl. `web2-e2e` (3 shards, all green).

A configured runner that is down (Judge0 outage) no longer breaks the code pages: B-COD-23, b1d86df.

Open: the authenticated prod pass, the 7-day window, then 2.8 and S-12 (`docs/STAGE-2-CUTOVER.md`).
