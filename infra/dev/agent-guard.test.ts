import { expect, test } from 'bun:test'

import { verdict } from './agent-guard.ts'

test('a bare python REPL is refused; scripts, -c, heredocs and pipes pass', () => {
  for (const command of [
    'python3',
    'python3 -',
    'cd x && python',
    'python3 - 2>&1 || echo no',
    'py',
    'false || python',
  ])
    expect(verdict(command)).toContain('REPL')
  for (const command of [
    'python3 script.py',
    'python -c "print(1)"',
    "python3 - <<'EOF'\nprint(1)\nEOF",
    'cat x | python3 -',
    'bun run build',
    'grep -n python3 file',
    'echo py',
    'ls x && echo python3',
  ])
    expect(verdict(command)).toBeNull()
})

test('a backtick inside node -e "..." is refused; single quotes, heredocs and plain scripts pass', () => {
  expect(verdict('node -e "const s = `x`; console.log(s)"')).toContain('backtick')
  expect(verdict('cd a && bun -e "x" && node -e "y `z`"')).toContain('node')
  expect(verdict("node -e 'const s = `x`'")).toBeNull()
  expect(verdict('node -e "console.log(1)" && echo `date`')).toBeNull()
  expect(verdict("node - <<'EOF'\nconst s = `x`\nEOF")).toBeNull()
})

test('commits and pushes that skip the checks are refused; just commit/push and reads pass', () => {
  for (const command of [
    'jj commit -m x',
    'cd a && jj git push',
    'jj ci -m x',
    'git commit --no-verify -m x',
    'git push -n origin main',
  ])
    expect(verdict(command)).toContain('just commit')
  for (const command of [
    'just commit -m x',
    'just push',
    'jj log -r @',
    'jj git fetch',
    'git commit -m x',
    'jj describe -m x',
    'echo jj commit',
  ])
    expect(verdict(command)).toBeNull()
})
