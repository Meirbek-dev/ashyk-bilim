import type { ErrorComponentProps } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { BrandMark } from '#/shared/components/brand-mark'

import { ErrorView } from './error-view'

/**
 * The root route's error (the session could not be read: the API is down or restarting). The app shell needs that
 * session, so it is not there: the page keeps the brand, the page padding and a full reload home, around the same
 * «Что-то пошло не так» with «Повторить» as every route error.
 */
export function RootErrorView(props: ErrorComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4 md:px-6">
        {/* A document navigation: the router state is what failed. */}
        <Anchor href="/" variant="title">
          <BrandMark full className="h-8 w-auto" />
          <span className="sr-only">{m.platform_brand()}</span>
        </Anchor>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pt-gutter md:px-6">
        <ErrorView {...props} />
      </main>
    </div>
  )
}
