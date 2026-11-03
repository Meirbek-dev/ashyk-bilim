---
name: web2-slice
description: Build or fix a screen, route, form or query in apps/web-2 (React 19 + TanStack Start).
---

# web-2 slice

Read `apps/web-2/AGENTS.md`; for routes, auth or shell changes read `docs/web/ROUTES.md`.
Use the generated API client and localized catalogs; keep server access checks and upload policy authoritative.

- `just new feature <name>` is an optional scaffold. SPEC files and behavior IDs are not required.
- Prefer loader + Suspense for page data; ordinary queries suit conditional reads, widgets and dialogs.
  Mutation metadata handles common invalidation; explicit invalidation suits conditional or ordered workflows.
- Test changed behavior with focused unit, browser or E2E tests. Full suites run in CI; broaden locally for
  shared mechanisms or uncertain scope. Do not repeat successful checks on unchanged inputs without cause.
- For browser debugging: `just e2e web2 --serve`, then `just e2e web2 --reuse <spec or --grep title>`.
- Inspect screenshots (`just shoot`) for visible, responsive or UI-state changes. Data-only edits do not need them.
