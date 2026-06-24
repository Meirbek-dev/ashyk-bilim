'use client'

// Import Lucide icons
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardList,
  File,
  FileArchive,
  ImageIcon,
  Layers,
  StickyNote,
  Video,
} from 'lucide-react'
// Import custom components
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import CourseActionsMobile from '@components/Objects/Courses/CourseActions/CourseActionsMobile'
import CoursesActions from '@components/Objects/Courses/CourseActions/CoursesActions'
import CourseAuthors from '@components/Objects/Courses/CourseAuthors/CourseAuthors'
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper'
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators'
import CourseBreadcrumbs from '@components/Pages/Courses/CourseBreadcrumbs'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { useSession } from '@/hooks/useSession'
import PageLoading from '@components/Objects/Loaders/PageLoading'
// Import the new discussions component
import CourseDiscussions from '@/components/discussions'
import { getAbsoluteUrl } from '@services/config/config'
import { useRouter } from 'next/navigation'
// Import UI components
import { useMemo, useState } from 'react'
// Import existing components and utilities
import NextImage from '@components/ui/NextImage'
import { useIsMobile } from '@/hooks/use-mobile'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/features/content-markdown'

interface CourseClientProps {
  course: AppCourse
  courseuuid: string
  current_activity?: string
  initialDiscussions?: AppDiscussionPost[]
  trailData?: AppTrailData | null | undefined
}

type LearningItem = string | { emoji?: string; id?: number | string; link?: string; text: string }

function normalizeLearningsHelper(input: unknown): LearningItem[] {
  if (!input) return []

  // Already an array
  if (Array.isArray(input)) {
    return input
      .map(item => {
        if (typeof item === 'string') {
          const s = item.trim()
          if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null
          return s
        }
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          // Keep shape but ensure text field exists if possible
          const text = record.text ?? record.name ?? record.title
          const learningText = typeof text === 'string' ? text.trim() : text !== null ? String(text).trim() : ''
          if (!learningText || learningText.toLowerCase() === 'null' || learningText.toLowerCase() === 'undefined')
            return null
          return { text: learningText }
        }
        return null
      })
      .filter((item): item is LearningItem => Boolean(item))
  }

  // Object: maybe { learnings: [...] } or similar
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    if (Array.isArray(obj.learnings)) return normalizeLearningsHelper(obj.learnings)
    if (Array.isArray(obj.items)) return normalizeLearningsHelper(obj.items)
    if (Array.isArray(obj.data)) return normalizeLearningsHelper(obj.data)
    // Single object with text
    const text = obj.text ?? obj.name ?? obj.title
    if (text) return normalizeLearningsHelper([String(text)])
    return []
  }

  // String: try JSON first if it looks like JSON, else split plain text
  if (typeof input === 'string') {
    const raw = input.trim()
    if (!raw || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return []
    const looksJson = raw.startsWith('[') || raw.startsWith('{')
    if (looksJson) {
      try {
        const parsed = JSON.parse(raw)
        return normalizeLearningsHelper(parsed)
      } catch {
        // fall through to plain-text handling
      }
    }
    // Legacy: plain text list. Prefer newlines/semicolons/bullets; avoid splitting on commas aggressively.
    const parts = raw
      .split(/\r?\n|\u2022|\u2023|\u25E6|;|\||·|–|—/)
      .map(s => s.replace(/^[-*\s]+/, '').trim())
      .filter(s => s.length > 0 && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined')
    // If nothing split out meaningfully, keep as single item
    if (parts.length === 0) return [raw]
    return parts
  }

  return []
}

const CourseClient = (props: CourseClientProps) => {
  const t = useTranslations('CoursePage')
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({})
  const [activeThumbnailType, setActiveThumbnailType] = useState<'image' | 'video'>('image')

  const { courseuuid, course, initialDiscussions = [], trailData } = props
  const isMobile = useIsMobile()
  const { user: currentUser } = useSession()
  const router = useRouter()

  const mutateDiscussions = () => {
    router.refresh()
  }

  // Normalizes various formats of `course.learnings` into an array that the UI can render
  const learnings = useMemo(() => {
    return normalizeLearningsHelper(course?.learnings)
  }, [course?.learnings])

  const [prevCourse, setPrevCourse] = useState(course)
  if (course !== prevCourse) {
    setPrevCourse(course)
    if (course?.chapters) {
      const totalActivities = course.chapters.reduce(
        (sum: number, chapter: AppChapter) => sum + (chapter.activities?.length || 0),
        0,
      )
      const defaultExpanded: Record<string, boolean> = {}
      for (const [idx, chapter] of course.chapters.entries()) {
        if (chapter.chapter_uuid) {
          defaultExpanded[chapter.chapter_uuid] = idx === 0 ? true : totalActivities <= 5
        }
      }
      setExpandedChapters(defaultExpanded)
    }
  }

  const getActivityTypeLabel = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO': {
        return t('video')
      }
      case 'TYPE_DOCUMENT': {
        return t('document')
      }
      case 'TYPE_DYNAMIC': {
        return t('page')
      }
      case 'TYPE_FILE_SUBMISSION': {
        return t('fileSubmission')
      }
      case 'TYPE_EXAM': {
        return t('exam')
      }
      default: {
        return t('learningMaterial')
      }
    }
  }

  const isActivityDone = (activity: AppActivity) => {
    const cleanCourseUuid = course.course_uuid?.replace('course_', '')
    const run = trailData?.runs?.find((activeRun: AppTrailRun) => {
      const cleanRunCourseUuid = activeRun.course?.course_uuid?.replace('course_', '')
      return cleanRunCourseUuid === cleanCourseUuid
    })
    if (run) {
      return run.steps?.find((step: AppTrailStep) => step.activity_id === activity.id && step.complete === true)
    }
    return false
  }

  const isActivityCurrent = (activity: AppActivity) => {
    const activity_uuid = activity.activity_uuid.replace('activity_', '')
    return props.current_activity && props.current_activity === activity_uuid
  }

  return (
    <>
      {!course ? (
        <PageLoading />
      ) : (
        <>
          <GeneralWrapper>
            <CourseBreadcrumbs course={course} />

            {/* Page header */}
            <div className="pt-5 pb-8">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{course.name}</h1>
            </div>

            {/* Two-column layout */}
            <div className="flex flex-col gap-10 md:flex-row md:items-start">
              {/* Main content */}
              <div className="w-full min-w-0 space-y-10 md:w-3/4">
                {isMobile && (
                  <CourseActionsMobile courseuuid={courseuuid} course={course as never} trailData={trailData} />
                )}

                {/* Thumbnail */}
                {(() => {
                  const showVideo =
                    course.thumbnail_type === 'video' ||
                    (course.thumbnail_type === 'both' && activeThumbnailType === 'video')
                  const showImage =
                    course.thumbnail_type === 'image' ||
                    (course.thumbnail_type === 'both' && activeThumbnailType === 'image') ||
                    !course.thumbnail_type

                  const mediaSwitcher = (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="border-border bg-card flex overflow-hidden rounded-lg border shadow-sm">
                        <button
                          type="button"
                          onClick={() => setActiveThumbnailType('image')}
                          className={cn(
                            'flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                            activeThumbnailType === 'image'
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <ImageIcon size={11} />
                          {t('thumbnailTypeImage')}
                        </button>
                        <div className="bg-border w-px" />
                        <button
                          type="button"
                          onClick={() => setActiveThumbnailType('video')}
                          className={cn(
                            'flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                            activeThumbnailType === 'video'
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Video size={11} />
                          {t('thumbnailTypeVideo')}
                        </button>
                      </div>
                    </div>
                  )

                  if (showVideo && course.thumbnail_video) {
                    return (
                      <div className="border-border relative w-full overflow-hidden rounded-xl border">
                        {course.thumbnail_type === 'both' && mediaSwitcher}
                        <video
                          src={getCourseThumbnailMediaDirectory(course?.course_uuid, course?.thumbnail_video)}
                          className="h-auto w-full bg-black object-contain"
                          controls
                          autoPlay
                          muted
                          preload="metadata"
                          playsInline
                        />
                      </div>
                    )
                  }

                  if (showImage && course.thumbnail_image) {
                    return (
                      <div className="border-border bg-muted relative aspect-video w-full overflow-hidden rounded-xl border">
                        <NextImage
                          src={getCourseThumbnailMediaDirectory(course?.course_uuid, course?.thumbnail_image)}
                          alt={t('courseThumbnailAlt')}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 75vw"
                          loading="eager"
                        />
                        {course.thumbnail_type === 'both' && mediaSwitcher}
                      </div>
                    )
                  }

                  return (
                    <div className="border-border bg-muted relative aspect-video w-full overflow-hidden rounded-xl border">
                      <NextImage
                        src="/empty_thumbnail.avif"
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 75vw"
                        loading="eager"
                      />
                    </div>
                  )
                })()}

                {/* Progress indicators */}
                {(() => {
                  const cleanCourseUuid = course.course_uuid?.replace('course_', '')
                  return trailData?.runs?.find((activeRun: AppTrailRun) => {
                    const cleanRunCourseUuid = activeRun.course?.course_uuid?.replace('course_', '')
                    return cleanRunCourseUuid === cleanCourseUuid
                  })
                })() && (
                  <ActivityIndicators course_uuid={props.course.course_uuid} course={course} trailData={trailData} />
                )}

                {/* Course description */}
                {(course.description || course.about) && (
                  <MarkdownContent
                    content={course.description || course.about || ''}
                    mode="courseDescription"
                    className="text-foreground/90"
                  />
                )}

                {/* What you will learn */}
                {learnings.length > 0 && (typeof learnings[0] === 'string' || learnings[0]?.text !== 'null') && (
                  <div>
                    <h2 className="mb-4 text-lg font-semibold tracking-tight">{t('whatYouWillLearn')}</h2>
                    <div className="border-border rounded-xl border p-5">
                      <ul
                        className={cn('grid gap-x-8 gap-y-3', learnings.length > 4 ? 'sm:grid-cols-2' : 'grid-cols-1')}
                      >
                        {learnings.map((learning: LearningItem) => {
                          const learningText = typeof learning === 'string' ? learning : learning.text
                          const learningEmoji = typeof learning === 'string' ? null : learning.emoji
                          const learningId = typeof learning === 'string' ? learning : learning.id || learning.text
                          const rawHref = typeof learning === 'object' && learning ? learning.link : undefined
                          const href = typeof rawHref === 'string' ? rawHref.trim() : ''
                          const hasValidHref = Boolean(href && /^(?:[a-z][a-z0-9+.-]*:|\/|\.\/|\.\.\/|#)/i.test(href))
                          if (!learningText) return null
                          return (
                            <li key={learningId} className="flex items-start gap-3">
                              <span className="bg-primary/10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                                {learningEmoji ? (
                                  <span className="text-xs leading-none">{learningEmoji}</span>
                                ) : (
                                  <Check size={11} className="text-primary stroke-[2.5]" />
                                )}
                              </span>
                              <span className="flex-1 text-sm leading-relaxed">{learningText}</span>
                              {hasValidHref && (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground mt-0.5 ml-1 shrink-0 transition-colors"
                                  aria-label={t('linkTo', { learningText })}
                                >
                                  <ArrowRight size={13} />
                                </a>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Course chapters */}
                <div>
                  <h2 className="mb-4 text-lg font-semibold tracking-tight">{t('courseLessons')}</h2>
                  <div className="border-border overflow-hidden rounded-xl border">
                    {(course.chapters ?? []).map((chapter: AppChapter, idx: number) => {
                      const chapterKey = chapter.chapter_uuid ?? `chapter-${idx}`
                      const isExpanded = expandedChapters[chapterKey] ?? idx === 0
                      return (
                        <Collapsible
                          key={chapter.chapter_uuid || `chapter-${chapter.name}`}
                          open={isExpanded}
                          onOpenChange={open => {
                            setExpandedChapters(prev => ({
                              ...prev,
                              [chapterKey]: open,
                            }))
                          }}
                        >
                          <CollapsibleTrigger
                            nativeButton={false}
                            render={
                              <div
                                className={cn(
                                  'flex w-full cursor-pointer items-center px-5 py-4 transition-colors hover:bg-muted/40',
                                  idx > 0 && 'border-t border-border',
                                )}
                              />
                            }
                          >
                            <span className="text-muted-foreground mr-4 w-5 shrink-0 text-center font-mono text-xs tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <h3 className="truncate text-sm font-semibold">{chapter.name}</h3>
                              <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                                <Layers size={11} />
                                {t('activitiesCount', {
                                  count: chapter.activities?.length ?? 0,
                                })}
                              </span>
                            </div>
                            <ChevronDown
                              size={16}
                              className={cn(
                                'ml-3 shrink-0 text-muted-foreground transition-transform duration-200',
                                isExpanded && 'rotate-180',
                              )}
                            />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-border border-t">
                              {(chapter.activities ?? []).map((activity: AppActivity, actIdx: number) => {
                                const done = isActivityDone(activity)
                                const current = isActivityCurrent(activity)
                                return (
                                  <Link
                                    key={activity.activity_uuid}
                                    href={`${getAbsoluteUrl('')}/course/${courseuuid}/activity/${activity.activity_uuid.replace('activity_', '')}`}
                                    rel="noopener noreferrer"
                                    className={cn(
                                      'group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30',
                                      actIdx > 0 && 'border-t border-border/60',
                                    )}
                                  >
                                    {/* Completion indicator */}
                                    <div className="shrink-0">
                                      {done ? (
                                        <div className="bg-primary/15 flex h-5 w-5 items-center justify-center rounded-full">
                                          <Check size={10} className="text-primary stroke-3" />
                                        </div>
                                      ) : (
                                        <div className="border-border h-5 w-5 rounded-full border-2" />
                                      )}
                                    </div>
                                    {/* Activity info */}
                                    <div className="flex min-w-0 flex-1 flex-col">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={cn(
                                            'truncate text-sm font-medium',
                                            done ? 'text-muted-foreground' : 'text-foreground',
                                          )}
                                        >
                                          {activity.name}
                                        </span>
                                        {current && (
                                          <Badge
                                            variant="secondary"
                                            className="bg-primary/10 text-primary shrink-0 animate-pulse text-xs"
                                          >
                                            {t('current')}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-muted-foreground mt-0.5 flex items-center gap-1">
                                        {activity.activity_type === 'TYPE_DYNAMIC' && <StickyNote size={11} />}
                                        {activity.activity_type === 'TYPE_VIDEO' && <Video size={11} />}
                                        {activity.activity_type === 'TYPE_DOCUMENT' && <File size={11} />}
                                        {activity.activity_type === 'TYPE_FILE_SUBMISSION' && <FileArchive size={11} />}
                                        {activity.activity_type === 'TYPE_EXAM' && <ClipboardList size={11} />}
                                        <span className="text-xs">
                                          {getActivityTypeLabel(activity.activity_type ?? '')}
                                        </span>
                                      </div>
                                    </div>
                                    {/* Arrow */}
                                    <ArrowRight
                                      size={13}
                                      className="group-hover:text-muted-foreground shrink-0 text-transparent transition-all duration-150 group-hover:translate-x-0.5"
                                    />
                                  </Link>
                                )
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    })}
                  </div>
                </div>

                {/* Discussions */}
                <CourseDiscussions
                  initialPosts={initialDiscussions as never}
                  currentUser={currentUser}
                  courseUuid={course?.course_uuid}
                  onMutate={mutateDiscussions}
                />
              </div>

              {/* Sidebar */}
              <div className="hidden w-full shrink-0 space-y-4 md:block md:w-1/4">
                <CoursesActions courseuuid={courseuuid} course={course} trailData={trailData} />
                <CourseAuthors authors={(course.authors ?? []) as never} courseUuid={course.course_uuid} />
              </div>
            </div>
          </GeneralWrapper>
        </>
      )}
    </>
  )
}

export default CourseClient
