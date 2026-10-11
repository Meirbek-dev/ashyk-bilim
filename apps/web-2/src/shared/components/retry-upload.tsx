import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { Anchor } from './anchor'

/** «Повторить» for a failed upload; `signIn`: the session ended, so first a way to sign in again in a new tab. */
export function RetryUpload({
  file,
  disabled,
  retry,
  signIn = false,
}: {
  file: File
  disabled: boolean
  retry: (file: File) => Promise<void>
  signIn?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {signIn ? (
        <Anchor href="/login" target="_blank">
          {m.ui_file_sign_in()}
        </Anchor>
      ) : null}
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void retry(file)}>
        {m.ui_file_retry()}
      </Button>
    </div>
  )
}
