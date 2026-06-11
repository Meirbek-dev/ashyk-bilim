'use client'

import { AlertTriangle, Info, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@components/ui/alert'
import { Button } from '@components/ui/button'

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export function AuthErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertTriangle data-icon="inline-start" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function AuthSuccessBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <Alert>
      <Info data-icon="inline-start" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

// ---------------------------------------------------------------------------
// Submit button
// ---------------------------------------------------------------------------

interface AuthSubmitButtonProps {
  isPending: boolean
  label: string
  pendingLabel: string
  className?: string
}

export function AuthSubmitButton({ isPending, label, pendingLabel, className }: AuthSubmitButtonProps) {
  return (
    <Button type="submit" className={className ?? 'w-full'} disabled={isPending}>
      {isPending ? (
        <>
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  )
}
