import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const t = useTranslations('Components.Spinner');

  return (
    <Loader2Icon
      role="status"
      aria-label={t('loading')}
      className={cn('size-4 animate-spin text-primary', className)}
      {...props}
    />
  );
}

export { Spinner };
