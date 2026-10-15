# Frontend replacement: remaining work

Production runs `apps/web` (Next.js); `apps/web-2` is the TanStack replacement.
Both accept normal fixes. Implementation and hardening phases are complete;
old completion logs and temporary machine setup are in Git.

- Before switching: run current verification/E2E, including Judge0; run G-14
  against a fresh production backup; confirm an exam-free window and smoke accounts.
- Cutover, monitoring and rollback: `docs/STAGE-2-CUTOVER.md` sections 1–3.
- After the owner closes the rollback window: phase 9 in that guide; contract
  removals in `apps/server/docs/phase9-removals.md`.
- Acceptance requirements: `docs/web/ACCEPTANCE.md`.
- Outstanding browser check: verify real Safari. Windows WebKit (Playwright's WinCairo
  build) occasionally crashes the renderer when a signed-in page is resized, and after
  `pagehide` reports a navigation to the page being left ("goto interrupted"); a standalone
  script reproduces both without the suite (a few percent of runs, load-dependent, never on
  guest pages) and no app history call is involved. Linux WebKit (CI) is the evidence.

Use `just stack up`, `just login-as`, and `just e2e` from the root guide for local work.
Re-run checks on the release being considered; old green runs are not release evidence.
