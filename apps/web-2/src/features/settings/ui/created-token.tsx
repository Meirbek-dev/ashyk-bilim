import { m } from '#/paraglide/messages'
import type { CreatedAccessToken } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { clientConfig } from '../model/access-tokens'
import { CopyText } from './copy-text'

/** The secret right after creation, with the client snippet; it is never shown again. */
export function CreatedToken({
  created,
  endpoint,
  onDone,
}: {
  created: CreatedAccessToken
  endpoint: string
  onDone: () => void
}) {
  return (
    <output className="flex flex-col gap-4 rounded-md border border-success p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">{m.settings_tokens_created_title({ name: created.access_token.name })}</h3>
        <p className="text-sm text-muted-foreground">{m.settings_tokens_created_hint()}</p>
      </div>
      <CopyText label={m.settings_tokens_secret()} text={created.token} copyLabel={m.settings_tokens_copy_token()} />
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">{m.settings_tokens_config()}</h4>
        <p className="text-sm text-muted-foreground">{m.settings_tokens_config_hint()}</p>
      </div>
      <CopyText
        label={m.settings_tokens_config()}
        text={clientConfig(endpoint, created.token)}
        copyLabel={m.settings_tokens_copy_config()}
        multiline
      />
      <div>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {m.settings_tokens_done()}
        </Button>
      </div>
    </output>
  )
}
