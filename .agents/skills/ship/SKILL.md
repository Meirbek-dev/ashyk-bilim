---
name: ship
description: Commit, push and land work in ashyq-bilim (jj colocated with git, pre-commit/pre-push checks, worktrees, CI). Use whenever committing or pushing here.
---

# Ship

jj runs no git hooks, so commits and pushes go through `just`, which runs the same checks under jj and git.

- Before: `just check --wip` (only the uncommitted batch); `just brief` shows unpushed commits and the last verdict.
- Commit: `just commit -m "fix(web-2): <what the user sees now>"` (add jj filesets or git paths to commit part of the
  working copy). Under jj a failed check undoes the commit (`jj op restore`) and prints the findings; fix and repeat.
  One finished item per commit; prefixes as in `git log` (`feat(domain):`, `fix(web-2):`, `test:`, `docs:`, `chore:`).
- Push: `just push` (bookmark `main`, moved forward to `@-` under jj, then `git push` so the pre-push `just check` runs
  on the pushed commit). Never `--no-verify`, never force-push. On ai-server the SSH keepalive lives in `core.sshCommand`.
- Parallel work: `just wt new <name>` -> commit there -> `just wt land <name>` (rebase, check, fast-forward main).
- After pushing: `just ci-watch <run>` once; a red main is fixed before other work.
- Never commit env files, keys, `temp-restore/`, or `tmp/`.
