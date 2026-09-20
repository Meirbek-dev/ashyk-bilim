'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, Eye, Loader2, Save, Send, SlidersHorizontal } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { DATE_TIME_LONG_OPTIONS, formatDate } from '@/lib/date'
import { useApiError } from '@/hooks/useApiError'
import { APIError } from '@/lib/api/assertSuccess'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarDateTimePicker } from '@/components/ui/calendar'
import Link from '@components/ui/AppLink'
import {
  getFileSubmissionByActivity,
  publishFileSubmissionActivity,
  updateFileSubmissionActivity,
} from '@/features/file-submissions/services/file-submissions'
import type { FileSubmissionActivity } from '@/features/file-submissions/services/file-submissions'
import { fromUnix, toUnix } from '@/lib/api/contract'
import { getMimeCategories } from '@/features/file-submissions/mime-categories'
import type { MimeCategoryKey } from '@/features/file-submissions/mime-categories'
import { Checkbox } from '@/components/ui/checkbox'
import { MarkdownEditor, getMarkdownSaveGate, isMarkdownStructurallyEmpty } from '@/features/content-markdown'
import { CustomCheckbox } from '@/components/ui/custom/custom-checkbox'
import { ActivityAIDockLayout, ActivityAITrigger } from '@/features/ai-experience'
import type { AIScope } from '@/features/ai-experience'
import { CourseAIHub } from '@/features/course-qa'

interface FileSubmissionStudioProps {
  courseUuid: string
  activityUuid: string
}

const queryKey = (activityUuid: string) => ['file-submission', 'studio', activityUuid] as const

/** `key` → `FileSubmission.mimeCategories.<key>` in the catalogs. */
const MIME_PRESETS: { id: string; key: MimeCategoryKey; mimes: string[] }[] = [
  { id: 'pdf', key: 'pdf', mimes: ['application/pdf'] },
  {
    id: 'documents',
    key: 'documents',
    mimes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
      'application/epub+zip',
      'application/x-mobipocket-ebook',
    ],
  },
  {
    id: 'images',
    key: 'images',
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
  },
  {
    id: 'spreadsheets',
    key: 'spreadsheets',
    mimes: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
  },
  {
    id: 'archives',
    key: 'archives',
    mimes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-gzip',
    ],
  },
  {
    id: 'text',
    key: 'textAndCode',
    mimes: [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/x-python',
      'text/javascript',
      'text/typescript',
      'text/css',
      'text/html',
      'application/xml',
      'text/x-c++src',
      'text/x-csrc',
      'text/x-java-source',
    ],
  },
]

export default function FileSubmissionStudio({ courseUuid, activityUuid }: FileSubmissionStudioProps) {
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '')
  const queryClient = useQueryClient()
  const locale = useLocale()
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [maxFiles, setMaxFiles] = useState(1)
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number | ''>('')
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[]>([])
  const aiScope: AIScope = {
    courseUuid,
    activityUuid,
    surface: 'teacher-studio',
  }

  const { data, isLoading, error } = useQuery(
    queryOptions({
      queryKey: queryKey(cleanActivityUuid),
      queryFn: () => getFileSubmissionByActivity(cleanActivityUuid),
      enabled: Boolean(cleanActivityUuid),
    }),
  )

  const [prevData, setPrevData] = useState<FileSubmissionActivity | null>(null)

  if (data && data !== prevData) {
    setPrevData(data)
    setTitle(data.title)
    setInstructions(data.instructions)
    setDueAt(data.due_at_unix ? toDateTimeLocal(fromUnix(data.due_at_unix)) : '')
    setMaxFiles(data.max_files)
    setMaxFileSizeMb(data.max_file_size_mb ?? '')
    setAllowedMimeTypes(data.allowed_mime_types ?? [])
  }

  const ALL_MIMES = MIME_PRESETS.flatMap(preset => preset.mimes)
  const allMimesSelected = ALL_MIMES.every(mime => allowedMimeTypes.includes(mime))
  const someMimesSelected = ALL_MIMES.some(mime => allowedMimeTypes.includes(mime))

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setAllowedMimeTypes(ALL_MIMES)
    } else {
      setAllowedMimeTypes([])
    }
  }

  const togglePreset = (mimes: string[], checked: boolean) => {
    setAllowedMimeTypes(current => {
      const next = new Set(current)
      for (const mime of mimes) {
        if (checked) next.add(mime)
        else next.delete(mime)
      }
      return [...next]
    })
  }

  const t = useTranslations('FileSubmissionStudio')
  const tCategory = useTranslations('FileSubmission.mimeCategories')
  const { toastApiError } = useApiError()
  const isPublished = data?.lifecycle === 'published'

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error(t('unavailableError'))
      return await updateFileSubmissionActivity(data.id, {
        title,
        instructions,
        due_at_unix: dueAt ? toUnix(new Date(dueAt)) : null,
        max_files: maxFiles,
        max_file_size_mb: maxFileSizeMb === '' ? null : maxFileSizeMb,
        allowed_mime_types: allowedMimeTypes,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKey(cleanActivityUuid),
      })
      toast.success(t('saveSuccess'))
    },
    onError: saveError => {
      // BUG-219: a live task refused an edit that would leave it unready.
      if (saveError instanceof APIError && saveError.code === 'conflict' && saveError.details?.readiness) {
        toast.error(t('fixInstructionsBeforeSaving'))
        return
      }
      toastApiError(saveError, undefined, t('saveError'))
    },
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error(t('unavailableError'))
      return await publishFileSubmissionActivity(data.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKey(cleanActivityUuid),
      })
      toast.success(t('publishSuccess'))
    },
    onError: publishError => {
      toastApiError(publishError, undefined, t('publishError'))
    },
  })

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const gate = getMarkdownSaveGate(instructions, 'fileSubmissionInstructions', {
      intent: 'draft',
      required: true,
    })
    if (!gate.canSave || (isPublished && isMarkdownStructurallyEmpty(instructions))) {
      toast.error(gate.errors[0]?.message ?? t('fixInstructionsBeforeSaving'))
      return
    }
    saveMutation.mutate()
  }
  const publishGate = getMarkdownSaveGate(instructions, 'fileSubmissionInstructions', {
    intent: 'publish',
    required: true,
  })

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {t('loadingStudio')}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">{t('studioUnavailable')}</div>
    )
  }

  return (
    <ActivityAIDockLayout
      scope={aiScope}
      defaultMode="review"
      panel={<CourseAIHub courseUuid={courseUuid} scope={aiScope} variant="panel" />}
      className="bg-background min-h-screen"
    >
      <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="min-w-0">
            <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
              <Link
                href={`/dash/courses/${courseUuid.replace('course_', '')}/curriculum`}
                className="hover:text-foreground"
              >
                {t('curriculum')}
              </Link>
              <span>/</span>
              <span>{t('fileSubmission')}</span>
              <span>/</span>
              <span>{t('studio')}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{data.title}</h1>
              <Badge variant={isPublished ? 'default' : 'secondary'}>{t(`lifecycle.${data.lifecycle}`)}</Badge>
              {data.due_at_unix ? (
                <Badge variant="outline">
                  <CalendarClock className="mr-1 size-3" />
                  {formatDate(fromUnix(data.due_at_unix), locale, DATE_TIME_LONG_OPTIONS)}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActivityAITrigger scope={aiScope} />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/course/${courseUuid.replace('course_', '')}/activity/${cleanActivityUuid}`} />}
            >
              <Eye className="size-4" />
              {t('preview')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || publishMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t('save')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!publishGate.canPublish) {
                  toast.error(publishGate.errors[0]?.message ?? t('fixInstructionsBeforePublishing'))
                  return
                }
                publishMutation.mutate()
              }}
              disabled={
                isPublished ||
                publishMutation.isPending ||
                saveMutation.isPending ||
                !title.trim() ||
                isMarkdownStructurallyEmpty(instructions) ||
                !publishGate.canPublish
              }
            >
              {publishMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isPublished ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <Send className="size-4" />
              )}
              {isPublished ? t('published') : t('publish')}
            </Button>
          </div>
        </div>
      </header>

      <main className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
        <form onSubmit={save} className="space-y-5">
          <Field>
            <FieldLabel>{t('title')}</FieldLabel>
            <Input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} />
          </Field>
          <Field>
            <FieldLabel>{t('instructions')}</FieldLabel>
            <MarkdownEditor
              value={instructions}
              onChange={setInstructions}
              preset="fileSubmissionInstructions"
              required
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>{t('dueDate')}</FieldLabel>
              <CalendarDateTimePicker value={dueAt} onChange={setDueAt} placeholder={t('dueDate')} />
            </Field>
            <Field>
              <FieldLabel>{t('maxFiles')}</FieldLabel>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxFiles}
                onChange={event => setMaxFiles(Number(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel>{t('maxSize')}</FieldLabel>
              <Input
                type="number"
                min={1}
                value={maxFileSizeMb}
                onChange={event => setMaxFileSizeMb(event.target.value === '' ? '' : Number(event.target.value))}
              />
            </Field>
          </div>

          <Field>
            <div className="mb-2 flex items-center justify-between">
              <FieldLabel className="mb-0">{t('allowedFileTypes')}</FieldLabel>
              <Label className="hover:bg-muted/50 cursor-pointer rounded-md px-2 py-1 transition">
                <CustomCheckbox
                  checked={allMimesSelected}
                  indeterminate={someMimesSelected && !allMimesSelected}
                  onCheckedChange={handleSelectAll}
                />
                {t('selectAll')}
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MIME_PRESETS.map(preset => {
                const checked = preset.mimes.every(mime => allowedMimeTypes.includes(mime))
                return (
                  <Label
                    key={preset.id}
                    className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={nextChecked => togglePreset(preset.mimes, nextChecked)}
                      className="mt-0.5"
                    />
                    <div className="grid gap-0.5">
                      <span className="text-sm leading-none font-medium">{tCategory(preset.key)}</span>
                    </div>
                  </Label>
                )
              })}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">{t('allowedFileTypesDesc')}</p>
          </Field>
        </form>

        <aside className="space-y-4">
          <section className="rounded-md border p-4">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="text-muted-foreground size-4" />
              <h2 className="text-sm font-semibold">{t('collectionRules')}</h2>
            </div>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('attempts')}</dt>
                <dd>{data.max_attempts ?? t('unlimitedAttempts')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('lateWork')}</dt>
                <dd>{data.allow_late ? t('allowLateAllowed') : t('allowLateBlocked')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('allowedFiles')}</dt>
                <dd>
                  {data.allowed_mime_types.length > 0
                    ? getMimeCategories(data.allowed_mime_types)
                        .map(category => tCategory(category.key))
                        .join(', ')
                    : t('anyFileType')}
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-md border p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('review')}</h2>
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={
                <Link
                  href={`/dash/courses/${courseUuid.replace('course_', '')}/activity/${cleanActivityUuid}/review`}
                />
              }
            >
              {t('openSubmissions')}
            </Button>
          </section>
        </aside>
      </main>
    </ActivityAIDockLayout>
  )
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}
