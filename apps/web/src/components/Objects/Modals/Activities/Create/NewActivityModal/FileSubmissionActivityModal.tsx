'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { createFileSubmissionActivity } from '@/features/file-submissions/services/file-submissions';

const MIME_PRESETS = [
  { id: 'pdf', label: 'PDF', mimes: ['application/pdf'] },
  {
    id: 'documents',
    label: 'Documents',
    mimes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
    ],
  },
  { id: 'images', label: 'Images', mimes: ['image/jpeg', 'image/png', 'image/webp'] },
  {
    id: 'archives',
    label: 'Archives',
    mimes: ['application/zip', 'application/x-zip-compressed'],
  },
];

export default function FileSubmissionActivityModal({ chapterId, course, closeModal }: any) {
  const t = useTranslations('Components.NewFileSubmissionModal');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [maxFiles, setMaxFiles] = useState(1);
  const [maxSize, setMaxSize] = useState<number | ''>(25);
  const [selectedMimes, setSelectedMimes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePreset = (mimes: string[], checked: boolean) => {
    setSelectedMimes((current) => {
      const next = new Set(current);
      for (const mime of mimes) {
        if (checked) next.add(mime);
        else next.delete(mime);
      }
      return [...next];
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !instructions.trim()) {
      toast.error(t('requiredFields'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createFileSubmissionActivity({
        title,
        instructions,
        due_at: dueAt || null,
        max_files: maxFiles,
        max_file_size_mb: maxSize === '' ? null : maxSize,
        allowed_mime_types: selectedMimes,
        course_id: course?.courseStructure?.id,
        chapter_id: chapterId,
      });
      if (!result.success) {
        toast.error(t('createError'));
        return;
      }
      toast.success(t('createSuccess'));
      if (course?.courseStructure?.course_uuid) {
        await queryClient.invalidateQueries({
          queryKey: courseKeys.structure(course.courseStructure.course_uuid, course.withUnpublishedActivities),
        });
      }
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <Field>
        <FieldLabel>{t('title')}</FieldLabel>
        <FieldContent>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>{t('instructions')}</FieldLabel>
        <FieldContent>
          <Textarea
            value={instructions}
            className="min-h-32"
            onChange={(event) => setInstructions(event.target.value)}
          />
        </FieldContent>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel>{t('dueDate')}</FieldLabel>
          <FieldContent>
            <div className="relative">
              <Input
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
              <CalendarIcon className="text-muted-foreground pointer-events-none absolute top-2.5 right-3 size-4" />
            </div>
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
              onChange={(event) => setMaxFiles(Math.max(1, Number(event.target.value) || 1))}
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
              onChange={(event) => setMaxSize(event.target.value ? Number(event.target.value) : '')}
            />
          </FieldContent>
        </Field>
      </div>

      <div className="space-y-2">
        <FieldLabel>{t('allowedTypes')}</FieldLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {MIME_PRESETS.map((preset) => {
            const checked = preset.mimes.every((mime) => selectedMimes.includes(mime));
            return (
              <label
                key={preset.id}
                className="flex items-center gap-2 rounded-md border p-3 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => togglePreset(preset.mimes, value === true)}
                />
                {preset.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('creating') : t('createActivity')}
        </Button>
      </div>
    </form>
  );
}
