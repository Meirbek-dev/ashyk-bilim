'use client';

import { useSession } from '@/hooks/useSession';
import { logout } from '@/services/auth/auth';
import platformLogoFull from '@public/platform_logo_full.svg';
import platformLogoLightFull from '@public/platform_logo_light_full.svg';
import UserAvatar from '@components/Objects/UserAvatar';
import { useTheme } from '@/components/providers/theme-provider';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

const HomeClient = () => {
  const t = useTranslations('HomeClient');
  const { user: viewer } = useSession();
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoLightFull : platformLogoFull;

  return (
    <div className="flex flex-col">
      <div className="mx-auto flex items-center space-x-4 rounded-b-2xl pt-16 text-3xl font-semibold">
        <Image
          quality={100}
          width={230}
          src={logoSrc}
          alt="Ashyk Bilim logo"
          style={{ width: '100%', height: 'auto' }}
          loading="eager"
        />
      </div>

      <div className="mx-auto flex items-center space-x-4 pt-16 text-2xl font-semibold">
        <span>{t('hello')},</span> <UserAvatar />{' '}
        <span className="capitalize">
          {[viewer?.first_name, viewer?.middle_name, viewer?.last_name].filter(Boolean).join(' ')}
        </span>
      </div>
      <div className="mx-auto flex cursor-pointer items-center space-x-4 pt-16 text-2xl font-semibold">
        <span
          onClick={() => {
            void logout();
          }}
        >
          {t('signOut')}
        </span>
      </div>
    </div>
  );
};

export default HomeClient;
