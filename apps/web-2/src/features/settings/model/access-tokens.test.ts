import { describe, expect, test } from 'vite-plus/test'

import type { AccessToken } from '#/shared/api/gen/types.gen'

import { clientConfig, expiresInDays, mcpEndpoint, orderTokens, tokenState } from './access-tokens'

const NOW = 1_770_000_000

const token = (id: string, over: Partial<AccessToken> = {}): AccessToken => ({
  id,
  name: id,
  scope: 'read',
  created_at_unix: NOW - 1000,
  last_used_at_unix: null,
  expires_at_unix: null,
  revoked_at_unix: null,
  ...over,
})

describe('access tokens', () => {
  test('the endpoint is the API path on the site origin', () => {
    expect(mcpEndpoint('https://ashyq.example')).toBe('https://ashyq.example/api/v2/mcp')
    expect(mcpEndpoint('https://ashyq.example/')).toBe('https://ashyq.example/api/v2/mcp')
  })

  test('the client snippet names the endpoint and sends the token as a bearer header', () => {
    const config: unknown = JSON.parse(clientConfig('https://a.test/api/v2/mcp', 'abq_x'))
    expect(config).toEqual({
      mcpServers: {
        ashyq: { type: 'http', url: 'https://a.test/api/v2/mcp', headers: { Authorization: 'Bearer abq_x' } },
      },
    })
  })

  test('revoked wins over expired; an unexpired or endless token is active', () => {
    expect(tokenState(token('a'), NOW)).toBe('active')
    expect(tokenState(token('b', { expires_at_unix: NOW + 1 }), NOW)).toBe('active')
    expect(tokenState(token('c', { expires_at_unix: NOW }), NOW)).toBe('expired')
    expect(tokenState(token('d', { expires_at_unix: NOW - 5, revoked_at_unix: NOW - 10 }), NOW)).toBe('revoked')
  })

  test('live tokens come first, each group in listing order', () => {
    const list = [
      token('revoked', { revoked_at_unix: NOW - 1 }),
      token('live-1'),
      token('expired', { expires_at_unix: NOW - 1 }),
      token('live-2'),
    ]
    expect(orderTokens(list, NOW).map(t => t.id)).toEqual(['live-1', 'live-2', 'revoked', 'expired'])
  })

  test('the expiry choice becomes days, «never» none', () => {
    expect(expiresInDays('30')).toBe(30)
    expect(expiresInDays('365')).toBe(365)
    expect(expiresInDays('never')).toBeUndefined()
  })
})
