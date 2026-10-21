# Routes, access, shell (apps/web-2)

Read before touching `src/routes/`, `shared/auth/`, the shell, live data or hydration-sensitive actions.


- Tree = spec 5.3: `_public` (`ssr: true`), `_guest` (signed-in -> `/home`), `_authed` (`ssr: 'data-only'`) with
  `teach.tsx` / `admin.tsx` guarded by `requireCapability`. `shared/auth/access.ts` is the one table "workspace ->
  section -> capability": guards, sidebar, bottom bar, switcher (and the palette) read it. A new nav section = a row.
- Route `staticData`: `title` (document title, layout heading), `layout: 'focus'` (the route draws
  `FocusPage` itself; the shell steps aside), `tabs` (a layout's tab routes; English label = URL segment),
  `skeleton: 'grid' | 'detail' | 'tiles'` (PendingView's shape, rows by default; chosen by route position only, never
  load status, so the data-only SSR paint and hydration agree). A tab's title is followed by its parent's. Tabs live
  in the layout route file; its `index.tsx` redirects to the first tab. A 403 thrown in `beforeLoad` renders in place
  (`ErrorView` -> `ForbiddenView`) and SSR answers with the ApiError's status (`shared/lib/ssr-status.ts`).
- No stub routes (gate `under-construction`). Each OpenAPI operation has a consumer in `src/`, is a service operation
  (`allowlist.json`) or is in `gates/server-removals.json` with a reason (G-07; a stale entry is an error).
- Live data: `GET /me/events` -> `shared/api/event-invalidations.ts` (event -> keys). An event skips a read that
  landed after it (`server-clock.ts`: stream-id time, offsets from arrivals and `Date`) and task-keyed reads of
  another activity. e2e: `expectReread(page, path)` when a test changes data behind an open page on purpose.
- Before hydration (/login ~140 ms, more on the stand) an SSR page works natively: navigation is a `Link`; an action
  that changes server-rendered state (a form's fieldset, enrol, leave) stays disabled until `useHydrated()`: a click
  React replays mid-hydration breaks it (React error 418). The auth fieldset carries `data-hydrating`, which the e2e fixture
  awaits. `FormDialog`, `ConfirmDialog` and `SheetPanel` keep their trigger disabled (with `data-hydrating`) the same way. `FileField` / `MultiSelectField` are not bound fields: render them inside `form.AppField`.
- Shell slots: `features/platform/ui/shell-slots.ts` (`search`: palette trigger, everyone; `notifications`: bell,
  signed-in). Set the slice's (lazy) component there, from its `route.ts`; an unset slot renders nothing.
- Entry chunk: only `loader` and the components are code-split; `validateSearch`,
  `search`, `beforeLoad`, `loaderDeps`, `head`, `staticData` and the root route (the shell) stay in the entry, which
  takes whole modules. Those options use a feature only via `#/features/<name>/route` (lint `ab/route-level-imports`);
  `route.ts` holds that code itself, no static import of its feature (`ab/route-entry-imports`; else `import()`). No
  generated SDK there (the session key is spelled out, pinned by `session.test.ts`).
