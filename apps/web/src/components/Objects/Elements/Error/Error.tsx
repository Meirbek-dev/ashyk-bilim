'use client'

import { AlertTriangle, HomeIcon, RefreshCcw } from 'lucide-react'
import { getAbsoluteUrl } from '@services/config/config'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, buttonVariants } from '@/components/ui/button'
import Link from '@components/ui/AppLink'
import { cn } from '@/lib/utils'

const ErrorUI = ({ message, submessage }: { message?: string; submessage?: string }) => {
  const t = useTranslations('Components.ErrorUI')
  const router = useRouter()

  function reloadPage() {
    router.refresh()
    globalThis.location.reload()
  }

  return (
    <div className="border-border bg-card mx-auto flex max-w-xl flex-col items-center justify-center space-y-6 rounded-xl border p-8 py-12 text-center antialiased shadow-xs">
      <div className="flex flex-col items-center space-y-4">
        <div className="bg-destructive/10 text-destructive flex h-16 w-16 items-center justify-center rounded-full">
          <AlertTriangle size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-foreground text-2xl font-bold tracking-tight">{message || t('defaultMessage')}</h2>
          {submessage && <p className="text-muted-foreground text-base">{submessage}</p>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button type="button" onClick={reloadPage} variant="destructive" size="lg">
          <RefreshCcw className="size-4" />
          <span>{t('retryButton')}</span>
        </Button>
        <Link href={getAbsoluteUrl('/home')} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
          <HomeIcon className="size-4" />
          <span>{t('homeButton')}</span>
        </Link>
      </div>
    </div>
  )
}

export default ErrorUI
