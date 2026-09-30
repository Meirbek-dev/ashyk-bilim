'use client'

import { useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'
import type { SaveStatus } from '@/stores/courses/courseEditorStore'

interface EditorSaveIndicatorProps {
  saveState: SaveStatus
}

export function EditorSaveIndicator({ saveState }: EditorSaveIndicatorProps) {
  const t = useTranslations('DashPage.Editor.EditorWrapper')

  if (saveState === 'idle') return null

  // UX-214: removed from the course's authors mid-edit — say so, not «save failed».
  if (saveState === 'forbidden') {
    return (
      <span role="alert" className="text-destructive rounded-md px-2 py-0.5 text-xs font-medium">
        {t('noAccess')}
      </span>
    )
  }

  if (saveState === 'conflict') {
    return (
      <span
        role="alert"
        className="text-destructive flex items-center gap-2 rounded-md px-2 py-0.5 text-xs font-medium"
      >
        <span>{t('conflict')}</span>
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => {
            globalThis.location.reload()
          }}
        >
          {t('reload')}
        </button>
      </span>
    )
  }

  return (
    <span className="text-muted-foreground flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs">
      {saveState === 'saving' ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          <span>{t('saving')}</span>
        </>
      ) : saveState === 'saved' ? (
        <>
          <Check className="size-3 text-lime-700 dark:text-lime-500" />
          <span>{t('saveSuccess')}</span>
        </>
      ) : (
        <span className="text-destructive font-medium">{t('saveError')}</span>
      )}
    </span>
  )
}
