import { expect, test } from 'bun:test'

import { browserErrors, readLogs, slowPlans } from './prod-report'

test('production log windows convert days to Docker-supported hours', () => {
  const commands: string[][] = []
  const run = (...args: string[]) => {
    commands.push(args)
    return { code: 0, out: 'log entry' }
  }
  expect(readLogs('server', '7d', run)).toBe('log entry')
  readLogs('server', '1.5d', run)
  readLogs('server', '24h', run)
  readLogs('server', '2026-11-01T00:00:00Z', run)
  expect(commands).toEqual([
    ['logs', '--since', '168h', 'server'],
    ['logs', '--since', '36h', 'server'],
    ['logs', '--since', '24h', 'server'],
    ['logs', '--since', '2026-11-01T00:00:00Z', 'server'],
  ])
})

test('an unreadable production log fails instead of reporting no errors', () => {
  expect(() => readLogs('server', 'invalid', () => ({ code: 1, out: 'invalid duration' }))).toThrow(
    'docker logs server: invalid duration',
  )
})

test('an empty log is clean only when Docker read it successfully', () => {
  expect(readLogs('server', '24h', () => ({ code: 0, out: '' }))).toBe('')
})

test('browser errors group by kind, route and message, ignoring request lines', () => {
  const report = (path: string) =>
    JSON.stringify({
      time: '2026-11-18T10:00:00Z',
      level: 'error',
      source: 'browser',
      report: { kind: 'error', message: 'x is undefined', path },
    })
  const log = [
    report('/learn/courses/0196a3b2-0000-7000-8000-000000000001'),
    report('/learn/courses/0196a3b2-0000-7000-8000-000000000002'),
    JSON.stringify({ level: 'info', path: '/', status: 200 }),
    'not json',
  ].join('\n')
  const rows = browserErrors(log)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toContain('x is undefined')
  expect(rows[0]).toContain('2')
  expect(browserErrors('')).toEqual(['  none'])
})

test('slow plans group by database and statement and keep the head of the slowest plan', () => {
  const entry = (ms: number, value: string, plan: string[]) =>
    [
      `2026-11-23 20:13:35.850 UTC [76] user=ashyq_app db=ashyq app=ashyq-server LOG:  duration: ${ms} ms  plan:`,
      '\tQuery Text: SELECT id',
      `\t  FROM users WHERE email = '${value}' AND id <> 0196a3b2-0000-7000-8000-000000000001`,
      ...plan.map(l => `\t${l}`),
    ].join('\n')
  const seq = ['Seq Scan on users  (cost=0.00..9.00 rows=1 width=16) (actual rows=1.00 loops=1)']
  const log = [
    entry(612.5, 'a@b.kz', seq),
    `2026-11-23 20:13:35.851 UTC [76] user=ashyq_app db=ashyq app=ashyq-server LOG:  duration: 613.0 ms  statement: SELECT 1`,
    entry(900, 'c@d.kz', [
      'Limit  (cost=0.00..9.00 rows=1 width=16) (actual rows=1.00 loops=1)',
      '  Buffers: shared hit=3',
      '  ->  Sort  (cost=0.00..9.00 rows=1 width=16) (actual rows=1.00 loops=1)',
      '        Sort Method: external merge  Disk: 4096kB',
      ...seq.map(l => `        ->  ${l}`),
      '              Rows Removed by Filter: 9000',
    ]),
    '2026-11-23 20:14:00.000 UTC [80] user=zitadel db=zitadel app= LOG:  duration: 700 ms  plan:',
    '\tQuery Text: SELECT 1',
    '\tResult  (cost=0.00..0.01 rows=1 width=4) (actual rows=1.00 loops=1)',
    'not a log line',
  ].join('\n')
  const rows = slowPlans(log)
  expect(rows[0]).toContain('     2  ashyq: SELECT id FROM users WHERE email = ')
  expect(rows[0]).toContain('(max 900 ms, last 2026-11-23 20:13)')
  expect(rows.join('\n')).not.toContain('@')
  expect(rows.slice(1, 5).map(r => r.trim())).toEqual([
    'Limit (cost=0.00..9.00 rows=1 width=16) (actual rows=1.00 loops=1)',
    'Sort Method: external merge Disk: 4096kB',
    '-> Seq Scan on users (cost=0.00..9.00 rows=1 width=16) (actual rows=1.00 loops=1)',
    'Rows Removed by Filter: 9000',
  ])
  expect(rows[5]).toContain('     1  zitadel: SELECT ?')
  expect(rows).toHaveLength(7)
  expect(slowPlans('')).toEqual(['  none'])
})
