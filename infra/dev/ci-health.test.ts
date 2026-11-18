import { expect, test } from 'bun:test'

import { ciHealth } from './ci-health'

test('ci health counts finished runs of the last 30 days, red and re-run shares', () => {
  const now = Date.parse('2026-11-30T00:00:00Z')
  const run = (conclusion: string, day: number, attempt = 1) => ({
    conclusion,
    createdAt: new Date(now - day * 86_400_000).toISOString(),
    attempt,
  })
  const runs = [
    run('success', 1),
    run('failure', 2),
    run('success', 3, 2),
    run('cancelled', 4),
    run('', 0),
    run('failure', 40),
  ]
  expect(ciHealth(runs, now)).toEqual({ runs: 3, red: '33%', rerun: '33%' })
  expect(ciHealth([], now)).toEqual({ runs: 0, red: 'n/a', rerun: 'n/a' })
})
