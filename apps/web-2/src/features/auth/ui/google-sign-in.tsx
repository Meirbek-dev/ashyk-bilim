import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'

import { googleStartHref } from '../model/login-search'

/** "Sign in with Google": a full navigation into the API, which returns the browser to `redirect`. */
export function GoogleSignIn({ redirect, label = m.auth_login_google() }: { redirect: string; label?: string }) {
  return (
    // The divider stands midway: the same step to the button over it as to the first field under it.
    <div className="flex flex-col gap-6">
      <Anchor href={googleStartHref(redirect)} className={buttonVariants({ variant: 'outline' })}>
        <img src="/brand/google-g.svg" alt="" className="size-4" />
        {label}
      </Anchor>
      <p className="flex items-center gap-3 text-sm text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        {m.auth_login_or()}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </p>
    </div>
  )
}
