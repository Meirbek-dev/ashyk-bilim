'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { buildLoginRedirect } from '@/lib/auth/redirect'
import { retryAfterSignIn, subscribeUploadSessionExpired, uploadSessionExpired } from '@/lib/auth/upload-hold'

/**
 * The session ended while a file was uploading (`upload-hold.ts`): the page
 * stays; sign in in a new tab (same cookie), then «Повторить» lets the upload
 * finish its stored file. Not a dialog: the page keeps working meanwhile.
 */
export function UploadSessionNotice() {
  const expired = useSyncExternalStore(subscribeUploadSessionExpired, uploadSessionExpired, () => false)
  const t = useTranslations('Components.UploadSessionNotice')
  if (!expired) return null
  const { pathname, search } = globalThis.location
  return (
    <div
      role="alert"
      className="bg-popover text-popover-foreground fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md flex-col gap-2 rounded-lg border p-3 text-sm shadow-lg"
    >
      <p>{t('text')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={buildLoginRedirect(`${pathname}${search}`)}
          target="_blank"
          rel="noopener"
          className="underline underline-offset-4"
        >
          {t('signIn')}
        </a>
        <Button size="sm" variant="outline" onClick={retryAfterSignIn}>
          {t('retry')}
        </Button>
      </div>
    </div>
  )
}
