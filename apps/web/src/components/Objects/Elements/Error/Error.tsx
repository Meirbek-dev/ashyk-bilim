'use client';

import { AlertTriangle, HomeIcon, RefreshCcw } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';

const ErrorUI = ({ message, submessage }: { message?: string; submessage?: string }) => {
  const t = useTranslations('Components.ErrorUI');
  const router = useRouter();

  function reloadPage() {
    router.refresh();
    globalThis.location.reload();
  }

  return (
    <div className="mx-auto flex flex-col items-center space-y-6 bg-linear-to-b from-rose-100 to-rose-100/5 py-10 antialiased">
      <div className="flex flex-row items-center space-x-5 rounded-xl">
        <AlertTriangle
          className="text-rose-700"
          size={45}
        />
        <div className="flex flex-col">
          <p className="text-3xl font-bold text-rose-700">{message || t('defaultMessage')}</p>
          {submessage ? <p className="text-lg font-bold text-rose-700">{submessage}</p> : null}
        </div>
      </div>
      <div className="flex space-x-4">
        <button
          onClick={() => {
            reloadPage();
          }}
          className="flex items-center space-x-2 rounded-full bg-rose-700 px-4 py-1 text-rose-200 shadow-lg transition-all ease-linear hover:bg-rose-800"
        >
          <RefreshCcw
            className="text-rose-200"
            size={17}
          />
          <span className="text-base font-bold">{t('retryButton')}</span>
        </button>
        <Link
          href={getAbsoluteUrl('/home')}
          className="flex items-center space-x-2 rounded-full bg-gray-700 px-4 py-1 text-gray-200 shadow-lg transition-all ease-linear hover:bg-gray-800"
        >
          <HomeIcon
            className="text-gray-200"
            size={17}
          />
          <span className="text-base font-bold">{t('homeButton')}</span>
        </Link>
      </div>
    </div>
  );
};

export default ErrorUI;
