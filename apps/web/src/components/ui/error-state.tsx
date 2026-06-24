import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getSupportReference } from '@/lib/api/assertSuccess'
import { cn } from '@/lib/utils'

interface SupportReferenceProps {
  error?: unknown
  reference?: string | null | undefined
}

export function SupportReference({ error, reference }: SupportReferenceProps) {
  const t = useTranslations('Errors')
  const supportReference = reference ?? getSupportReference(error)
  if (!supportReference) return null
  return (
    <p className="text-muted-foreground text-xs">
      {t('reference')}{' '}
      <code className="bg-muted text-foreground rounded px-1.5 py-0.5">{supportReference}</code>
    </p>
  )
}

interface ErrorStateProps {
  actionLabel?: string
  children?: ReactNode
  className?: string
  description: ReactNode
  error?: unknown
  onAction?: () => void
  reference?: string | null | undefined
  title: ReactNode
  variant?: 'page' | 'section'
}

export function ErrorState({
  actionLabel = 'Retry',
  children,
  className,
  description,
  error,
  onAction,
  reference,
  title,
  variant = 'section',
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center border text-center',
        variant === 'page' ? 'min-h-svh px-4 py-12' : 'min-h-[320px] rounded-lg p-6',
        className,
      )}
    >
      <div className="bg-destructive/10 text-destructive mb-4 flex size-10 items-center justify-center rounded-lg">
        <AlertTriangle className="size-5" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground mt-2 max-w-md text-sm">{description}</div>
      <div className="mt-3">
        <SupportReference error={error} reference={reference} />
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      {onAction ? (
        <Button type="button" onClick={onAction} className="mt-5 gap-2">
          <RotateCcw className="size-4" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

interface InlineErrorProps {
  className?: string
  description: ReactNode
  error?: unknown
  title?: ReactNode
}

export function InlineError({ className, description, error, title = 'Request failed' }: InlineErrorProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <div>{description}</div>
          <SupportReference error={error} />
        </div>
      </AlertDescription>
    </Alert>
  )
}
