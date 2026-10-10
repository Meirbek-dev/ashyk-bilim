'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

/** «Leave without saving?» for a `useUnsavedChangesGuard(..., { interceptInAppNavigation: true })` form. */
export function UnsavedChangesDialog({ guard }: { guard: ReturnType<typeof useUnsavedChangesGuard> }) {
  const tCommon = useTranslations('Common')
  return (
    <AlertDialog open={guard.isPromptOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="size-6 text-orange-500" />
          </AlertDialogMedia>
          <AlertDialogTitle>{tCommon('unsavedChanges')}</AlertDialogTitle>
          <AlertDialogDescription>{guard.promptMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={guard.cancelNavigation}>{tCommon('cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={guard.confirmNavigation}>
            {tCommon('leaveWithoutSaving')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
