import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/ui/button'

import { googleStartHref } from '../model/login-search'

/** "Sign in with Google": a full navigation into the API, which returns the browser to `redirect`. */
export function GoogleSignIn({ redirect }: { redirect: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Anchor href={googleStartHref(redirect)} className={buttonVariants({ variant: 'outline' })}>
        {m.auth_login_google()}
      </Anchor>
      <p className="text-center text-sm text-muted-foreground">{m.auth_login_or()}</p>
    </div>
  )
}
