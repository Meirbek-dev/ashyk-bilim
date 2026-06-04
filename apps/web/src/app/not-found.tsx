import appLogoFull from '@public/app_logo_full.svg'
import appLogoLightFull from '@public/app_logo_light_full.svg'
import { getTranslations } from 'next-intl/server'
import { Button } from '@components/ui/button'
import Link from '@components/ui/ServerLink'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'

export default async function NotFound() {
  const t = await getTranslations('NotFoundPage')
  const tCommon = await getTranslations('Common')

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center">
      <div className="flex items-center pb-20 hover:opacity-75 ltr:mr-auto rtl:ml-auto">
        <Image
          quality={100}
          width={270}
          height={98}
          src={appLogoFull}
          alt={tCommon('appLogoAlt')}
          style={{ height: 'auto' }}
          loading="eager"
          className="theme-logo-dark"
        />
        <Image
          quality={100}
          width={270}
          height={98}
          src={appLogoLightFull}
          alt={tCommon('appLogoAlt')}
          style={{ height: 'auto' }}
          loading="eager"
          className="theme-logo-light"
        />
      </div>
      <div className="space-y-6 text-center">
        <h1 className="text-foreground text-8xl leading-7 font-bold drop-shadow-md">{t('code')}</h1>
        <p className="text-foreground pt-8 text-lg leading-normal font-medium tracking-tight">{t('message')}</p>
      </div>
      <div className="flex flex-col items-center pt-8">
        <Button
          nativeButton={false}
          render={<Link href="/" className="flex items-center gap-2" />}
          className="flex h-[50px] items-center rounded-lg px-6 py-2 text-xl font-bold shadow-md"
        >
          {t('button')}
          <ArrowRight className="ml-1 tracking-tight transition-transform duration-150 ease-in-out group-hover:translate-x-0.5" />
        </Button>
      </div>
    </div>
  )
}
