import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { AccessTokenScope, CreatedAccessToken } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { siteOrigin } from '#/shared/lib/document-title'

import { EXPIRY_CHOICES, expiresInDays, mcpEndpoint, scopeLabel, type ExpiryChoice } from '../model/access-tokens'
import { createAccessTokenOptions } from '../queries'
import { CopyText } from './copy-text'
import { CreatedToken } from './created-token'
import { TypesetSection } from './typeset-section'

const vTokenForm = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  scope: v.picklist(['read', 'draft']),
  expiry: v.picklist(EXPIRY_CHOICES),
})

const defaultValues: { name: string; scope: AccessTokenScope; expiry: ExpiryChoice } = {
  name: '',
  scope: 'read',
  expiry: '90',
}

const expiryLabel: Record<ExpiryChoice, () => string> = {
  '30': m.settings_tokens_expiry_30,
  '90': m.settings_tokens_expiry_90,
  '365': m.settings_tokens_expiry_365,
  never: m.settings_tokens_expiry_never,
}

/** The MCP endpoint and a form for a new token; the new secret is shown once, with the client snippet. */
export function AccessTokensCreateSection() {
  const endpoint = mcpEndpoint(siteOrigin())
  const [created, setCreated] = useState<CreatedAccessToken | null>(null)
  const create = useMutation(createAccessTokenOptions(useQueryClient()))
  const form = useAppForm(vTokenForm, {
    defaultValues,
    onSubmit: async ({ name, scope, expiry }) => {
      const token = await create.mutateAsync({
        body: { name, scope, expires_in_days: expiresInDays(expiry) },
      })
      form.reset()
      setCreated(token)
    },
  })
  return (
    <TypesetSection
      title={m.settings_tokens_title()}
      description={m.settings_tokens_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
      submitLabel={m.settings_tokens_create()}
    >
      <CopyText label={m.settings_tokens_endpoint()} text={endpoint} copyLabel={m.settings_tokens_copy_endpoint()} />
      {created ? <CreatedToken created={created} endpoint={endpoint} onDone={() => setCreated(null)} /> : null}
      <form.AppField name="name">
        {field => (
          <field.TextField
            label={m.settings_tokens_field_name()}
            description={m.settings_tokens_field_name_hint()}
            autoComplete="off"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="scope">
        {field => (
          <field.SelectField
            label={m.settings_tokens_field_scope()}
            description={m.settings_tokens_scope_hint()}
            options={(['read', 'draft'] as const).map(value => ({ value, label: scopeLabel[value]() }))}
          />
        )}
      </form.AppField>
      <form.AppField name="expiry">
        {field => (
          <field.SelectField
            label={m.settings_tokens_field_expiry()}
            options={EXPIRY_CHOICES.map(value => ({ value, label: expiryLabel[value]() }))}
          />
        )}
      </form.AppField>
    </TypesetSection>
  )
}
