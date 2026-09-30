'use client'

import { useTranslations } from 'next-intl'
import { Eye } from 'lucide-react'
import Link from '@components/ui/AppLink'
import Image from 'next/image'
import { useTheme } from '@/components/providers/theme-provider'
import appLogoDark from '@public/app_logo.svg'
import appLogoLight from '@public/app_logo_light.svg'
import { Separator } from '@/components/ui/separator'
import { EditorSaveIndicator } from './EditorSaveIndicator'
import type { SaveStatus } from '@/stores/courses/courseEditorStore'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { useApiError } from '@/hooks/useApiError'

interface EditorHeaderProps {
  courseName: string
  activityName: string
  courseUuid: string
  activityUuid: string
  saveState: SaveStatus
  onSave: () => void
  assistantSlot?: ReactNode
}

/** The page's name, renamed in place (it could only be renamed from the curriculum before). */
function ActivityTitle({ courseUuid, activityUuid, name }: { courseUuid: string; activityUuid: string; name: string }) {
  const t = useTranslations('DashPage.Editor.Editor')
  const { updateActivity } = useActivityMutations(courseUuid, true)
  const { toastApiError } = useApiError()
  const [current, setCurrent] = useState(name)
  const [draft, setDraft] = useState<string | null>(null)

  const commit = async () => {
    const next = draft?.trim()
    setDraft(null)
    if (!next || next === current) return
    const previous = current
    setCurrent(next)
    try {
      await updateActivity(activityUuid, { name: next })
    } catch (error) {
      setCurrent(previous)
      toastApiError(error)
    }
  }

  if (draft !== null) {
    return (
      <input
        ref={node => node?.focus()}
        value={draft}
        aria-label={t('renamePage')}
        maxLength={200}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={event => {
          if (event.key === 'Enter') void commit()
          if (event.key === 'Escape') setDraft(null)
        }}
        className="border-input focus-visible:ring-ring/50 h-7 min-w-40 rounded-md border px-2 text-sm font-medium outline-none focus-visible:ring-2"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setDraft(current)}
      title={t('renamePage')}
      className="text-foreground hover:bg-muted truncate rounded-md px-1 font-medium"
    >
      {current}
    </button>
  )
}

export function EditorHeader({
  courseName,
  activityName,
  courseUuid,
  activityUuid,
  saveState,
  onSave,
  assistantSlot,
}: EditorHeaderProps) {
  const t = useTranslations('DashPage.Editor.Editor')
  const tCommon = useTranslations('Common')
  const { resolvedTheme } = useTheme()
  const logoSrc = resolvedTheme === 'dark' ? appLogoLight : appLogoDark

  return (
    <div className="border-border bg-background flex h-12 items-center justify-between border-b px-3">
      {/* Left: breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/">
          <Image
            className="rounded-md"
            width={22}
            height={22}
            src={logoSrc}
            alt={tCommon('appLogoAlt')}
            style={{ height: 'auto' }}
          />
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <nav className="flex min-w-0 items-center gap-1 truncate text-sm">
          {/* Back to the course's curriculum — where the author came from. */}
          <Link
            href={`/dash/courses/${courseUuid}/curriculum`}
            className="text-muted-foreground hover:text-foreground truncate font-medium transition-colors"
          >
            {courseName}
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <ActivityTitle courseUuid={courseUuid} activityUuid={activityUuid} name={activityName} />
        </nav>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <EditorSaveIndicator saveState={saveState} />
        {assistantSlot}

        <button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          onClick={onSave}
        >
          {t('save')}
        </button>

        <Link
          target="_blank"
          href={`/course/${courseUuid}/activity/${activityUuid}`}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-8 items-center justify-center rounded-md transition-colors"
          title={t('preview')}
        >
          <Eye className="size-4" />
        </Link>
      </div>
    </div>
  )
}
