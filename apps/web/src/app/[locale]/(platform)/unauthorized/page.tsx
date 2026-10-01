import { useTranslations } from 'next-intl'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import Link from '@components/ui/AppLink'
import { Button } from '@components/ui/button'
import { APP_NAME } from '@/lib/constants'
import { getStaticMetadataMessages } from '@/lib/localized-metadata'

// UX-267: cached metadata from the static catalogs - `getTranslations` reads
// request data, which Next 16 flags as URL data in `generateMetadata()`
// (the /dash/admin pattern).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  'use cache'

  const { locale } = await params
  const { UnauthorizedPage } = getStaticMetadataMessages(locale)
  return { title: `${UnauthorizedPage.title} - ${APP_NAME}`, robots: { index: false } }
}

// UX-280: a fully static body next to a locale-reading `generateMetadata` is
// what Next 16 flags as «URL data in generateMetadata()». The page is served
// per request anyway (redirect target), so say so: an empty dynamic marker
// inside <Suspense> lets the metadata stream while the card stays prerendered.
async function RequestTimeMarker() {
  await connection()
  return null
}

export default function UnauthorizedPage() {
  const t = useTranslations('UnauthorizedPage')
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <Suspense>
        <RequestTimeMarker />
      </Suspense>
      <div className="bg-card w-full max-w-md rounded-xl border p-8 text-center">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground mt-2.5 text-sm">{t('message')}</p>
        <Button nativeButton={false} render={<Link href="/" />} variant="outline" size="sm" className="mt-6">
          {t('button')}
        </Button>
      </div>
    </div>
  )
}
