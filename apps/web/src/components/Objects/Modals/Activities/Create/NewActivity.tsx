'use client'

import {
  ArrowLeft,
  ChevronRight,
  Code2,
  FileArchive,
  FileText,
  GraduationCap,
  LayoutTemplate,
  Loader2,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import CodeChallenge from './NewActivityModal/CodeChallengeActivityModal'
import DocumentPdfModal from './NewActivityModal/DocumentActivityModal'
import DynamicCanvaModal from './NewActivityModal/DynamicActivityModal'
import VideoModal from './NewActivityModal/VideoActivityModal'
import Exam from './NewActivityModal/ExamActivityModal'
import FileSubmission from './NewActivityModal/FileSubmissionActivityModal'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewType = 'home' | 'dynamic' | 'video' | 'documentpdf' | 'filesubmission' | 'exams' | 'codechallenge'

interface ActivityTypeConfig {
  id: Exclude<ViewType, 'home'>
  labelKey: string
  descriptionKey: string
  icon: LucideIcon
  /** Tailwind color token applied to the icon */
  iconColorClass: string
  /** Tailwind background token applied to the icon container */
  iconBgClass: string
  /** Optional badge label (e.g. "New") */
  badgeKey?: string
}

interface NewActivityModalProps {
  closeModal: () => void
  submitActivity: (payload: AppPayload) => Promise<void>
  submitFileActivity: (params: AppFileActivityInput) => Promise<void>
  submitExternalVideo: (external_video_data: AppPayload, activity: AppPayload, chapterId: number) => Promise<void>
  createAndOpenActivity: (kind: 'dynamic' | 'codechallenge') => Promise<void>
  chapterId: number
  course: AppCourse | AppCourseContextShape
}

// ─── Activity type registry ───────────────────────────────────────────────────

const ACTIVITY_TYPES: ActivityTypeConfig[] = [
  {
    id: 'dynamic',
    labelKey: 'dynamicPage',
    descriptionKey: 'dynamicPageDesc',
    icon: LayoutTemplate,
    iconColorClass: 'text-emerald-600 dark:text-emerald-400',
    iconBgClass: 'bg-emerald-50 dark:bg-emerald-950/60',
  },
  {
    id: 'video',
    labelKey: 'video',
    descriptionKey: 'videoDesc',
    icon: Video,
    iconColorClass: 'text-rose-600 dark:text-rose-400',
    iconBgClass: 'bg-rose-50 dark:bg-rose-950/60',
  },
  {
    id: 'documentpdf',
    labelKey: 'document',
    descriptionKey: 'documentDesc',
    icon: FileText,
    iconColorClass: 'text-sky-600 dark:text-sky-400',
    iconBgClass: 'bg-sky-50 dark:bg-sky-950/60',
  },
  {
    id: 'filesubmission',
    labelKey: 'fileSubmission',
    descriptionKey: 'fileSubmissionDesc',
    icon: FileArchive,
    iconColorClass: 'text-violet-600 dark:text-violet-400',
    iconBgClass: 'bg-violet-50 dark:bg-violet-950/60',
  },
  {
    id: 'exams',
    labelKey: 'exams',
    descriptionKey: 'examsDesc',
    icon: GraduationCap,
    iconColorClass: 'text-amber-600 dark:text-amber-400',
    iconBgClass: 'bg-amber-50 dark:bg-amber-950/60',
  },
  {
    id: 'codechallenge',
    labelKey: 'codeChallenge',
    descriptionKey: 'codeChallengeDesc',
    icon: Code2,
    iconColorClass: 'text-teal-600 dark:text-teal-400',
    iconBgClass: 'bg-teal-50 dark:bg-teal-950/60',
  },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function NewActivityModal({
  closeModal,
  submitActivity,
  submitFileActivity,
  submitExternalVideo,
  createAndOpenActivity,
  chapterId,
  course,
}: NewActivityModalProps) {
  const t = useTranslations('Components.NewActivity')
  const [selectedView, setSelectedView] = useState<ViewType>('home')
  const [isQuickCreating, setIsQuickCreating] = useState<Exclude<ViewType, 'home'> | null>(null)

  const handleBack = useCallback(() => setSelectedView('home'), [])

  const handleTypeSelect = useCallback(
    async (view: Exclude<ViewType, 'home'>) => {
      if (view !== 'dynamic' && view !== 'codechallenge') {
        setSelectedView(view)
        return
      }

      setIsQuickCreating(view)
      try {
        await createAndOpenActivity(view)
      } finally {
        setIsQuickCreating(null)
      }
    },
    [createAndOpenActivity],
  )

  const sharedProps = { chapterId, course, closeModal }

  const isHome = selectedView === 'home'

  const activeConfig = !isHome ? ACTIVITY_TYPES.find(a => a.id === selectedView) : null

  return (
    <div className="w-full">
      {/* ── Header ── */}
      <div className="mb-5 flex items-center gap-2">
        {!isHome && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 rounded-md"
            aria-label={t('backToActivities')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <div className="min-w-0">
          <h2 className="text-foreground text-sm leading-none font-semibold tracking-tight">
            {isHome ? t('chooseType') : activeConfig ? t(activeConfig.labelKey) : ''}
          </h2>
        </div>
      </div>

      {/* ── Home: activity picker ── */}
      {isHome && (
        <div
          role="list"
          aria-label={t('chooseType')}
          className="border-border bg-card overflow-hidden rounded-xl border shadow-sm"
        >
          {ACTIVITY_TYPES.map((activity, index) => (
            <ActivityTypeRow
              key={activity.id}
              config={activity}
              label={t(activity.labelKey)}
              description={t(activity.descriptionKey)}
              onClick={() => void handleTypeSelect(activity.id)}
              isLoading={isQuickCreating === activity.id}
              isDisabled={isQuickCreating !== null && isQuickCreating !== activity.id}
              isLast={index === ACTIVITY_TYPES.length - 1}
            />
          ))}
        </div>
      )}

      {/* ── Sub-views ── */}
      {selectedView !== 'home' && (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-150">
          {selectedView === 'dynamic' && <DynamicCanvaModal submitActivity={submitActivity} {...sharedProps} />}
          {selectedView === 'video' && (
            <VideoModal
              submitFileActivity={submitFileActivity}
              submitExternalVideo={submitExternalVideo}
              chapterId={chapterId}
              course={course}
              closeModal={closeModal}
            />
          )}
          {selectedView === 'documentpdf' && (
            <DocumentPdfModal
              submitFileActivity={submitFileActivity}
              chapterId={chapterId}
              course={course}
              closeModal={closeModal}
            />
          )}
          {selectedView === 'filesubmission' && <FileSubmission {...sharedProps} />}
          {selectedView === 'exams' && <Exam submitActivity={submitActivity} {...sharedProps} />}
          {selectedView === 'codechallenge' && <CodeChallenge submitActivity={submitActivity} {...sharedProps} />}
        </div>
      )}
    </div>
  )
}

// ─── ActivityTypeRow ──────────────────────────────────────────────────────────

interface ActivityTypeRowProps {
  config: ActivityTypeConfig
  label: string
  description: string
  onClick: () => void
  isLoading?: boolean
  isDisabled?: boolean
  isLast?: boolean
}

function ActivityTypeRow({
  config,
  label,
  description,
  onClick,
  isLoading = false,
  isDisabled = false,
  isLast = false,
}: ActivityTypeRowProps) {
  const Icon = config.icon

  const t = useTranslations('Components.NewActivity')

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading || isDisabled}
        aria-busy={isLoading}
        className={cn(
          'group relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left',
          'transition-colors duration-100',
          'hover:bg-accent',
          'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          'disabled:pointer-events-none',
          isDisabled && !isLoading && 'opacity-40',
          !isLast && 'border-b border-border',
        )}
      >
        {/* Icon */}
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            'ring-1 ring-inset ring-border/60 transition-colors duration-100',
            'group-hover:ring-border',
            config.iconBgClass,
          )}
          aria-hidden="true"
        >
          {isLoading ? (
            <Loader2 className={cn('h-4 w-4 animate-spin', config.iconColorClass)} />
          ) : (
            <Icon className={cn('h-4 w-4', config.iconColorClass)} />
          )}
        </span>

        {/* Text */}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-foreground text-sm font-medium">{label}</span>
            {isLoading && <span className="text-muted-foreground text-xs">{t('opening')}</span>}
          </span>
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">{description}</span>
        </span>

        {/* Chevron */}
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground/40',
            'transition-transform duration-100 ease-out',
            'group-hover:translate-x-0.5 group-hover:text-muted-foreground',
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
