# web-2: remaining work

`apps/web-2` is the production web; the old `apps/web` is deleted. Old completion logs and temporary machine setup
are in Git.

- Cutover leftovers (host steps of the first deploy, `migrate-editor-docs --after-cutover`, phase 9 contract and
  rename): `docs/STAGE-2-CUTOVER.md`; server removals in `apps/server/docs/phase9-removals.md`.
- SPA build replacing the Node container: `docs/REWRITE.md` section 7 and phase 1.
- ui-sdk (DESIGN 8): `AnchoredListbox` maps onto
  Trigger Menu and MultiCombobox's "Show more" onto `onLoadMore`. Beta gaps to re-check on each release (worked
  around in the kit): `items` does not filter rendered children; Combobox content and list both carry
  `role=listbox`; with controlled `open` and an input inside, Escape skips `onOpenChange`; a popup open from the
  start takes no focus; a `render`ed part takes the rendered component's `data-slot`; `finalFocus` takes no ref; a
  click on the page during a modal's exit transition (100 ms) is dropped (e2e waits for the dialog to be hidden);
  `createTransfer` (activities across chapters) is `@experimental` and its Up/Down stop at a list's ends (the kit
  crosses into the next list itself).

Use `just stack up`, `just login-as`, and `just e2e` from the root guide for local work.
Re-run checks on the release being considered; old green runs are not release evidence.
