---
name: debug-e2e
description: Reproduce and fix a failing or flaky Playwright e2e test of web-2 or the legacy web in ashyq-bilim, locally or from CI.
---

# Debug e2e

1. Read the summary `just e2e` printed: the first line counts failed/flaky/passed; failing titles follow. Excerpt the log
   instead of printing it: `just diagnose tmp/e2e/<app>-<slot>/playwright.log`; a trace:
   `just diagnose --trace <extracted.trace>`. Never paste raw traces, snapshots or whole CI logs.
2. Stand once, iterate fast: `just e2e web2 --serve`, then `just e2e web2 --reuse e2e/specs/<file>.spec.ts --grep "<id>"`.
   Test edits need no restart; app edits need `--stop` and `--serve` (the build is part of the stand).
3. Many "identity provider unreachable" at once = parallel logins against Zitadel: rerun with `--workers=2`.
   `@runner` specs need the code runner (`just dev-runner`); without it they fail by design.
4. Classify before fixing: product bug (fix the app, keep the test), wrong test (fix the test), flake (fix its wait on a
   real signal - a response, a role, a URL - never `waitForTimeout`). A flake that cannot be fixed today is quarantined:
   skip it with a `suppressions` entry in `apps/web-2/gates/allowlist.json` and a line in `apps/web-2/BACKLOG.md`,
   the same day.
5. CI: one `just ci-watch <run>`; after a failed run `just ci-retry <run>` keeps the green shards.
6. Done = the focused spec green, then the full suite (`just e2e web2`), then `just commit`.
