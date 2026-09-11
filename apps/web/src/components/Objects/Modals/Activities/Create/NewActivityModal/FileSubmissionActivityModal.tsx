'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CalendarDatePicker } from '@/components/ui/calendar'
import { courseKeys } from '@/hooks/courses/courseKeys'
import { toUnix } from '@/lib/api/contract'
import { createFileSubmissionActivity } from '@/features/file-submissions/services/file-submissions'
import { MarkdownEditor, isMarkdownStructurallyEmpty } from '@/features/content-markdown'
import type { MimeCategoryKey } from '@/features/file-submissions/mime-categories'

const MIME_PRESETS: { id: string; labelKey: MimeCategoryKey; mimes: string[] }[] = [
  { id: 'pdf', labelKey: 'pdf', mimes: ['application/pdf'] },
  {
    id: 'documents',
    labelKey: 'documents',
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
    labelKey: 'images',
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
  },
  {
    id: 'spreadsheets',
    labelKey: 'spreadsheets',
    mimes: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
  },
  {
    id: 'archives',
    labelKey: 'archives',
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
    labelKey: 'textAndCode',
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

export default function FileSubmissionActivityModal({ chapterId, course, closeModal }: AppActivityModalProps) {
  const t = useTranslations('Components.NewFileSubmissionModal')
  const tMime = useTranslations('FileSubmission.mimeCategories')
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [maxFiles, setMaxFiles] = useState(1)
  const [maxSize, setMaxSize] = useState<number | ''>(25)
  const [selectedMimes, setSelectedMimes] = useState<string[]>(() => MIME_PRESETS.flatMap(preset => preset.mimes))
  const [isSubmitting, setIsSubmitting] = useState(false)

  const ALL_MIMES = MIME_PRESETS.flatMap(preset => preset.mimes)
  const allMimesSelected = ALL_MIMES.every(mime => selectedMimes.includes(mime))
  const someMimesSelected = ALL_MIMES.some(mime => selectedMimes.includes(mime))

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMimes(ALL_MIMES)
    } else {
      setSelectedMimes([])
    }
  }

  const togglePreset = (mimes: string[], checked: boolean) => {
    setSelectedMimes(current => {
      const next = new Set(current)
      for (const mime of mimes) {
        if (checked) next.add(mime)
        else next.delete(mime)
      }
      return [...next]
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || isMarkdownStructurallyEmpty(instructions)) {
      toast.error(t('requiredFields'))
      return
    }
    setIsSubmitting(true)
    try {
      await createFileSubmissionActivity({
        title,
        instructions,
        due_at_unix: dueAt ? toUnix(new Date(dueAt)) : null,
        max_files: maxFiles,
        max_file_size_mb: maxSize === '' ? null : maxSize,
        allowed_mime_types: selectedMimes,
        chapter_id: chapterId,
      })
      toast.success(t('createSuccess'))
      if (course?.courseStructure?.course_uuid) {
        await queryClient.invalidateQueries({
          queryKey: courseKeys.structure(course.courseStructure.course_uuid, course.withUnpublishedActivities),
        })
      }
      closeModal()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('createError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="file-submission-title">{t('title')}</FieldLabel>
        <FieldContent>
          <Input id="file-submission-title" value={title} onChange={event => setTitle(event.target.value)} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>{t('instructions')}</FieldLabel>
        <FieldContent>
          <MarkdownEditor
            value={instructions}
            onChange={setInstructions}
            preset="fileSubmissionInstructions"
            minHeight={180}
            required
          />
        </FieldContent>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel>{t('dueDate')}</FieldLabel>
          <FieldContent>
            <CalendarDatePicker value={dueAt} onChange={setDueAt} placeholder={t('dueDate')} />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel>{t('maxFiles')}</FieldLabel>
          <FieldContent>
            <Input
              type="number"
              min={1}
              max={25}
              value={maxFiles}
              onChange={event => setMaxFiles(Math.max(1, Number(event.target.value) || 1))}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel>{t('maxSize')}</FieldLabel>
          <FieldContent>
            <Input
              type="number"
              min={1}
              value={maxSize}
              onChange={event => setMaxSize(event.target.value ? Number(event.target.value) : '')}
            />
          </FieldContent>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <FieldLabel>{t('allowedTypes')}</FieldLabel>
          <Label className="hover:bg-muted/50 cursor-pointer rounded-md px-2 py-1 transition">
            <Checkbox
              checked={allMimesSelected}
              indeterminate={someMimesSelected && !allMimesSelected}
              onCheckedChange={handleSelectAll}
            />
            {t('selectAll')}
          </Label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {MIME_PRESETS.map(preset => {
            const checked = preset.mimes.every(mime => selectedMimes.includes(mime))
            return (
              <Label key={preset.id} className="hover:bg-muted/50 cursor-pointer rounded-md border p-3 transition">
                <Checkbox checked={checked} onCheckedChange={value => togglePreset(preset.mimes, value)} />
                {tMime(preset.labelKey)}
              </Label>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('creating') : t('createActivity')}
        </Button>
      </div>
    </form>
  )
}
