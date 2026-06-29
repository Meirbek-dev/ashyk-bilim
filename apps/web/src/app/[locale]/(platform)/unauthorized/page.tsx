import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { Button } from '@components/ui/button'

export default function UnauthorizedPage() {
  const t = useTranslations('UnauthorizedPage')
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
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
