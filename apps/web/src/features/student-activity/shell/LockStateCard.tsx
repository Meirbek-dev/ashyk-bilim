'use client'

import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { Button } from '@/components/ui/button'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'

interface LockStateCardProps {
  runtime: StudentActivityRuntime
}

function cleanUuid(uuid: string | null | undefined, prefix: 'course_' | 'activity_') {
  return uuid?.replace(new RegExp(`^${prefix}`), '') ?? ''
}

/**
 * LockStateCard
 *
 * Renders a full-content explanation when the activity is locked or unavailable.
 * Replaces the orphaned "Доступ заблокирован" ghost button that gave no context.
 *
 * Displayed when:
 * - runtime.progress.state === 'locked'
 * - runtime.progress.state === 'unavailable'
 *
 * The BottomActionBar still renders Prev/Next navigation.
 */
export default function LockStateCard({ runtime }: LockStateCardProps) {
  const t = useTranslations('ActivityPage')
  const { state } = runtime.progress
  const { reason } = runtime.primary_action

  const isLocked = state === 'locked'
  const isUnavailable = state === 'unavailable'

  if (!isLocked && !isUnavailable) return null

  const title = isLocked ? t('lockedTitle') : t('unpublishedActivity')
  const body = (() => {
    switch (reason) {
      case 'locked': {
        return t('lockedReasonLocked')
      }
      case 'unavailable': {
        return t('unpublishedActivity')
      }
      case 'authentication_required': {
        return t('signInRequired')
      }
      default: {
        return isLocked ? t('lockedReasonLocked') : t('unpublishedActivity')
      }
    }
  })()

  const courseHref = `/course/${cleanUuid(runtime.course.uuid, 'course_')}`

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
      <div className="bg-muted flex size-16 items-center justify-center rounded-xl">
        <Lock className="text-muted-foreground size-8" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground text-sm leading-6">{body}</p>
      <Button variant="outline" nativeButton={false} render={<Link href={courseHref} />}>
        {t('backToCourse')}
      </Button>
    </div>
  )
}
