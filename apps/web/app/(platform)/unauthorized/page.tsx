import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';

export default function UnauthorizedPage() {
  const t = useTranslations('UnauthorizedPage');
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="bg-card max-w-md rounded-2xl border p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground mt-3 text-sm">{t('message')}</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-md border px-4 py-2 text-sm font-medium"
        >
          {t('button')}
        </Link>
      </div>
    </div>
  );
}
