import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AccessToken } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { formatDate } from '#/shared/i18n/format'

import { orderTokens, scopeLabel, tokenState } from '../model/access-tokens'
import { accessTokensOptions } from '../queries'
import { PlainSection } from './plain-section'
import { RevokeAccessToken } from './revoke-access-token'

function tokenLine(token: AccessToken, nowUnix: number) {
  const state = tokenState(token, nowUnix)
  const created = m.settings_token_created({ date: formatDate(token.created_at_unix, undefined, { withYear: true }) })
  const used =
    token.last_used_at_unix == null
      ? m.settings_token_unused()
      : m.settings_token_used({ date: formatDate(token.last_used_at_unix, undefined, { withYear: true }) })
  const until =
    state === 'revoked' && token.revoked_at_unix != null
      ? m.settings_token_revoked_at({ date: formatDate(token.revoked_at_unix, undefined, { withYear: true }) })
      : token.expires_at_unix == null
        ? m.settings_token_no_expiry()
        : state === 'expired'
          ? m.settings_token_expired_at({ date: formatDate(token.expires_at_unix, undefined, { withYear: true }) })
          : m.settings_token_expires({ date: formatDate(token.expires_at_unix, undefined, { withYear: true }) })
  return { state, text: [scopeLabel[token.scope](), created, used, until].join(' · ') }
}

/** The user's tokens: live ones can be revoked; revoked and expired ones stay listed, marked. */
export function AccessTokensListSection() {
  const { data } = useSuspenseQuery(accessTokensOptions())
  const [nowUnix] = useState(() => Math.floor(Date.now() / 1000))
  return (
    <PlainSection title={m.settings_tokens_list_title()} description={m.settings_tokens_list_hint()}>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.settings_tokens_empty()}</p>
      ) : (
        <DataList items={orderTokens(data, nowUnix)} getKey={token => token.id} variant="rows">
          {token => {
            const { state, text } = tokenLine(token, nowUnix)
            return (
              <div className="flex flex-col gap-2 @md:flex-row @md:items-start @md:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className={state === 'active' ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                    {token.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
                {state === 'active' ? <RevokeAccessToken id={token.id} name={token.name} /> : null}
              </div>
            )
          }}
        </DataList>
      )}
    </PlainSection>
  )
}
