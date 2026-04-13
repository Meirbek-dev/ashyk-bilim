import platformLogoFull from '@public/platform_logo_full.svg';
import platformLogoLightFull from '@public/platform_logo_light_full.svg';
import { getTranslations } from 'next-intl/server';
import { Button } from '@components/ui/button';
import Link from '@components/ui/ServerLink';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';

export default async function NotFound() {
  const t = await getTranslations('NotFoundPage');

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center">
      <div className="nx-flex nx-items-center hover:nx-opacity-75 ltr:nx-mr-auto rtl:nx-ml-auto pb-20">
        <Image
          quality={100}
          width={270}
          src={platformLogoLightFull}
          alt="logo"
          style={{ height: 'auto' }}
          loading="eager"
          className="dark:hidden"
        />
        <Image
          quality={100}
          width={270}
          src={platformLogoFull}
          alt="logo"
          style={{ height: 'auto' }}
          loading="eager"
          className="hidden dark:block"
        />
      </div>
      <div className="space-y-6 text-center">
        <h1 className="text-foreground text-8xl leading-7 font-bold drop-shadow-md">404!</h1>
        <p className="text-foreground pt-8 text-lg leading-normal font-medium tracking-tight">{t('message')}</p>
      </div>
      <div className="flex flex-col items-center pt-8">
        <Button className="flex h-[50px] items-center rounded-lg px-6 py-2 text-xl font-bold shadow-md">
          <Link
            className="flex items-center gap-2"
            href="/"
            prefetch={false}
          >
            {t('button')}
            <ArrowRight className="ml-1 tracking-tight transition-transform duration-150 ease-in-out group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
