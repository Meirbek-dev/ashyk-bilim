import type { AccessToken, AccessTokenScope } from '#/shared/api/gen/types.gen'
import { m } from '#/paraglide/messages'

/** Where MCP clients connect: the API's own origin (nginx serves the web and the API on one host). */
export const mcpEndpoint = (origin: string) => `${origin.replace(/\/+$/, '')}/api/v2/mcp`

/** The `mcpServers` entry MCP clients read (Claude Code `.mcp.json`, Claude Desktop and others). */
export const clientConfig = (endpoint: string, token: string) =>
  JSON.stringify(
    { mcpServers: { ashyq: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  )

export type TokenState = 'active' | 'expired' | 'revoked'

/** A revoked token stays revoked; an unrevoked one past its date has expired. */
export const tokenState = (token: AccessToken, nowUnix: number): TokenState => {
  if (token.revoked_at_unix != null) return 'revoked'
  if (token.expires_at_unix != null && token.expires_at_unix <= nowUnix) return 'expired'
  return 'active'
}

/** Live tokens first (newest first, as listed), then the ones that no longer work. */
export const orderTokens = (tokens: readonly AccessToken[], nowUnix: number) => [
  ...tokens.filter(token => tokenState(token, nowUnix) === 'active'),
  ...tokens.filter(token => tokenState(token, nowUnix) !== 'active'),
]

/** The expiry choices of the create form, in days (`never` sends none). */
export const EXPIRY_CHOICES = ['30', '90', '365', 'never'] as const
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]

export const expiresInDays = (choice: ExpiryChoice): number | undefined =>
  choice === 'never' ? undefined : Number(choice)

export const scopeLabel: Record<AccessTokenScope, () => string> = {
  read: m.settings_tokens_scope_read,
  draft: m.settings_tokens_scope_draft,
}
