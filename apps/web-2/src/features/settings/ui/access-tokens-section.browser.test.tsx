import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AccessToken } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'
import { siteOrigin } from '#/shared/lib/document-title'

import { mcpEndpoint } from '../model/access-tokens'
import { accessTokensOptions } from '../queries'
import { AccessTokensListSection } from './access-tokens-list'
import { AccessTokensCreateSection } from './access-tokens-section'

const NOW = Math.floor(Date.now() / 1000)

const token = (id: string, over: Partial<AccessToken> = {}): AccessToken => ({
  id,
  name: `Agent ${id}`,
  scope: 'read',
  created_at_unix: NOW - 3600,
  last_used_at_unix: null,
  expires_at_unix: null,
  revoked_at_unix: null,
  ...over,
})

const render = async (tokens: AccessToken[]) => {
  const client = new QueryClient()
  client.setQueryData(accessTokensOptions().queryKey, tokens)
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <AccessTokensCreateSection />
        <AccessTokensListSection />
      </Suspense>
    </QueryClientProvider>,
  )
}

test('the MCP address is shown to copy, and the form offers read and draft access', async () => {
  const screen = await render([])
  const endpoint = screen.getByLabelText(m.settings_tokens_endpoint())
  await expect.element(endpoint).toBeInTheDocument()
  expect(endpoint.element().textContent).toBe(mcpEndpoint(siteOrigin()))
  await expect.element(screen.getByRole('button', { name: m.settings_tokens_copy_endpoint() })).toBeInTheDocument()
  await expect.element(screen.getByRole('option', { name: m.settings_tokens_scope_draft() })).toBeInTheDocument()
  await expect.element(screen.getByText(m.settings_tokens_empty())).toBeInTheDocument()
})

test('only a live token can be revoked; revoked and expired ones stay listed after it', async () => {
  const screen = await render([
    token('old', { revoked_at_unix: NOW - 60 }),
    token('live'),
    token('lapsed', { expires_at_unix: NOW - 60 }),
  ])
  const names = screen.getByRole('heading', { level: 3 })
  await expect.element(names.first()).toHaveTextContent('Agent live')
  expect(names.elements().map(el => el.textContent)).toEqual(['Agent live', 'Agent old', 'Agent lapsed'])
  expect(screen.getByRole('button', { name: m.settings_token_revoke() }).elements()).toHaveLength(1)
  await expect.element(screen.getByText(m.settings_token_unused(), { exact: false }).first()).toBeInTheDocument()
})
