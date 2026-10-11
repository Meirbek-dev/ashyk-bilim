import appLogoFull from '@public/app_logo_full.svg'
import appLogoLightFull from '@public/app_logo_light_full.svg'
import { getTranslations } from 'next-intl/server'
import { Button } from '@components/ui/button'
import AppLink from '@components/ui/AppLink'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { APP_NAME } from '@/lib/constants'
import DocumentTitle from '@components/ui/document-title'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'
import { MISSING_HEADERS } from '@/lib/missing-resource'
import type { MissingKind } from '@/lib/missing-resource'
import { headers } from 'next/headers'
import { Suspense } from 'react'

/**
 * A missing course / lesson / collection / profile reaches here from the proxy (ROUND3-17) with its kind in the
 * request headers: it gets the resource's own card (with «Войти» for a guest, a private course may open after
 * signing in). The 404 status is already set, so reading the headers may stream.
 */
export default function NotFound() {
  return (
    <Suspense fallback={null}>
      <ResolvedNotFound />
    </Suspense>
  )
}

async function ResolvedNotFound() {
  const requestHeaders = await headers()
  const kind = requestHeaders.get(MISSING_HEADERS.kind) as MissingKind | null
  if (!kind) return <GenericNotFound />
  const courseId = requestHeaders.get(MISSING_HEADERS.course)
  const tErrors = await getTranslations('Errors')
  return (
    <main className="flex min-h-screen w-full items-center justify-center">
      <DocumentTitle title={`${tErrors(`${kind}NotFound`)} - ${APP_NAME}`} />
      <ResourceNotFound
        type={kind}
        session={requestHeaders.has(MISSING_HEADERS.guest) ? null : true}
        {...(courseId ? { courseuuid: courseId } : {})}
      />
    </main>
  )
}

async function GenericNotFound() {
  const t = await getTranslations('NotFoundPage')
  const tCommon = await getTranslations('Common')

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center">
      <DocumentTitle title={`${t('title')} - ${APP_NAME}`} />
      <div className="flex items-center pb-10">
        <Image
          quality={100}
          width={180}
          height={65}
          src={appLogoFull}
          alt={tCommon('appLogoAlt')}
          style={{ height: 'auto' }}
          loading="eager"
          className="theme-logo-dark"
        />
        <Image
          quality={100}
          width={180}
          height={65}
          src={appLogoLightFull}
          alt={tCommon('appLogoAlt')}
          style={{ height: 'auto' }}
          loading="eager"
          className="theme-logo-light"
        />
      </div>
      <div className="max-w-md space-y-3 px-4 text-center">
        <p className="text-muted-foreground text-6xl leading-none font-bold tabular-nums">{t('code')}</p>
        <h1 className="text-foreground text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-pretty">{t('message')}</p>
      </div>
      <div className="flex flex-col items-center pt-8">
        <Button nativeButton={false} render={<AppLink href="/" />} className="group">
          {t('button')}
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </div>
  )
}
