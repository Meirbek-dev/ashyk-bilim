import { expect, test } from 'bun:test'

import { readLogs } from './prod-report'

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
