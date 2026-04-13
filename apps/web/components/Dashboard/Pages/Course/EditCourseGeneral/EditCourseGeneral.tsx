'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { AlertTriangle, Image as ImageIcon, Loader2, Tag, Video } from 'lucide-react';
import { SectionHeader } from '@components/Dashboard/Courses/SectionHeader';
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import type { CourseGeneralValues } from '@/schemas/courseSchemas';
import { useSyncDirtySection } from '@/hooks/useSyncDirtySection';
import { useCourse } from '@components/Contexts/CourseContext';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { courseGeneralSchema } from '@/schemas/courseSchemas';
import { TagsInput } from '@components/ui/custom/tags-input';
import { useEffect, useId, useMemo, useState } from 'react';
import { useSaveSection } from '@/hooks/useSaveSection';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Separator } from '@components/ui/separator';
import LearningItemsList from './LearningItemsList';
import { Textarea } from '@components/ui/textarea';
import ThumbnailUpdate from './ThumbnailUpdate';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import type * as v from 'valibot';

// Placeholder ID is stable across SSR and hydration; LearningItemsList replaces it
// with a real UUID in a post-mount effect, avoiding hydration mismatches.
const LEARNINGS_PLACEHOLDER_ID = '__placeholder_0__';

function initializeLearnings(learnings: any): string {
  if (!learnings) return JSON.stringify([{ id: LEARNINGS_PLACEHOLDER_ID, text: '', emoji: '📝' }]);
  try {
    const parsed = JSON.parse(learnings);
    if (Array.isArray(parsed)) return learnings;
  } catch {
    if (typeof learnings === 'string') {
      return JSON.stringify([{ id: LEARNINGS_PLACEHOLDER_ID, text: learnings, emoji: '📝' }]);
    }
  }
  return JSON.stringify([{ id: LEARNINGS_PLACEHOLDER_ID, text: '', emoji: '📝' }]);
}

function parseTags(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((tag) => String(tag).trim()).filter(Boolean);
    } catch {
      // Fallback to legacy comma-separated data
    }
    return raw
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function buildFormValues(courseStructure: any): CourseGeneralValues {
  return {
    name: courseStructure?.name || '',
    description: courseStructure?.description || '',
    about: courseStructure?.about || '',
    learnings: initializeLearnings(courseStructure?.learnings || ''),
    tags: parseTags(courseStructure?.tags),
    public: courseStructure?.public ?? false,
    thumbnail_type: courseStructure?.thumbnail_type || 'image',
  };
}

function EditCourseGeneral() {
  const t = useTranslations('CourseEdit.General');
  const tCommon = useTranslations('Common');
  const [error, setError] = useState('');

  const thumbnailTypeItems = [
    {
      value: 'image',
      label: (
        <div className="flex items-center gap-2">
          <ImageIcon
            className="h-4 w-4"
            aria-hidden="true"
          />
          {t('image')}
        </div>
      ),
    },
    {
      value: 'video',
      label: (
        <div className="flex items-center gap-2">
          <Video
            className="h-4 w-4"
            aria-hidden="true"
          />
          {t('video')}
        </div>
      ),
    },
    {
      value: 'both',
      label: (
        <div className="flex items-center gap-2">
          <ImageIcon
            className="h-4 w-4"
            aria-hidden="true"
          />
          <Video
            className="h-4 w-4"
            aria-hidden="true"
          />
          {t('both')}
        </div>
      ),
    },
  ];

  const course = useCourse();
  const { isLoading, courseStructure } = course;
  const formId = useId();
  const { updateMetadata } = useCoursesMutations(courseStructure?.course_uuid ?? '');

  const serverValues = useMemo(() => buildFormValues(courseStructure), [courseStructure]);

  type CourseGeneralInputValues = v.InferInput<typeof courseGeneralSchema>;

  const form = useForm<CourseGeneralInputValues, any, CourseGeneralValues>({
    resolver: valibotResolver(courseGeneralSchema),
    defaultValues: serverValues,
    mode: 'onChange',
  });

  const thumbnailType = useWatch({
    control: form.control,
    name: 'thumbnail_type',
    defaultValue: serverValues.thumbnail_type,
  });

  const { isDirty } = form.formState;

  // Keep the global store's dirty map in sync — no separate state needed.
  useSyncDirtySection('general', isDirty);

  const { isSaving, saveWithoutRefresh } = useSaveSection({
    section: 'general',
    errorMessage: t('errors.saveFailed'),
    successMessage: tCommon('saved'),
    onError: setError,
  });

  // Hydrate form from server data on mount / when server data changes.
  // RHF's `reset` only runs when values actually differ, so it's cheap.
  useEffect(() => {
    if (!isLoading && courseStructure) {
      form.reset(serverValues, { keepDirtyValues: true });
    }
  }, [courseStructure, isLoading, serverValues, form]);

  const handleSubmit = async (values: CourseGeneralValues) => {
    setError('');

    await saveWithoutRefresh(
      async () =>
        updateMetadata(values, {
          lastKnownUpdateDate: course.courseStructure.update_date,
        }),
      {
        onSuccess: () => {
          form.reset(values);
          setError('');
        },
      },
    );
  };

  const handleDiscard = () => {
    form.reset(serverValues);
    setError('');
  };

  if (isLoading || !courseStructure) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground bg-muted flex animate-pulse items-center rounded-md border px-4 py-2 text-sm font-medium">
          <Loader2
            size={16}
            className="text-primary mr-2 animate-spin"
          />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      role="main"
      aria-labelledby="course-edit-title"
    >
      <form
        id={formId}
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
        noValidate
      >
        {error && (
          <Card
            className="border-destructive/50 bg-destructive/5"
            role="alert"
          >
            <CardContent className="p-4">
              <div
                id={`${formId}-error`}
                className="text-destructive flex items-center space-x-2"
              >
                <AlertTriangle
                  className="h-5 w-5"
                  aria-hidden="true"
                />
                <span className="font-medium">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <SectionHeader
              title={t('title', { courseName: courseStructure.name || '' })}
              description={t('subtitle')}
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={() => form.handleSubmit(handleSubmit)()}
              onDiscard={handleDiscard}
            />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-6">
              <Field>
                <FieldLabel
                  className="text-base font-semibold"
                  htmlFor="name"
                >
                  {t('name.label')}
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...form.register('name')}
                    id="name"
                    placeholder={t('name.placeholder')}
                    className="text-lg"
                    maxLength={100}
                  />
                </FieldContent>
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel
                  className="text-base font-semibold"
                  htmlFor="description"
                >
                  {t('description.label')}
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    {...form.register('description')}
                    id="description"
                    placeholder={t('description.placeholder')}
                    className="min-h-[100px] resize-y"
                    maxLength={1000}
                  />
                </FieldContent>
                <FieldError errors={[form.formState.errors.description]} />
              </Field>

              {/*<Field>
                <FieldLabel
                  className="text-base font-semibold"
                  htmlFor="about"
                >
                  {t('about.label')}
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    {...form.register('about')}
                    id="about"
                    placeholder={t('about.placeholder')}
                    className="min-h-[120px]"
                  />
                </FieldContent>
                <FieldError errors={[form.formState.errors.about]} />
              </Field> */}

              <Separator />

              <Controller
                control={form.control}
                name="learnings"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel className="text-base font-semibold">{t('learnings.label')}</FieldLabel>
                    <div
                      role="group"
                      aria-labelledby="learnings-label"
                    >
                      <LearningItemsList
                        value={field.value}
                        onChange={field.onChange}
                        error={fieldState.error?.message}
                      />
                    </div>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="tags"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel className="flex items-center gap-2 text-base font-semibold">
                      <Tag
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      {t('tags.label')}
                    </FieldLabel>
                    <TagsInput
                      placeholder={t('tags.placeholder')}
                      value={field.value || []}
                      onValueChange={field.onChange}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-foreground text-2xl font-bold tracking-tight">{t('thumbnail.label')}</h2>
              <p className="text-muted-foreground text-sm">{t('thumbnail.mediaUpdatesIsolated')}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-border bg-muted/40">
              <ImageIcon className="size-4" />
              <AlertTitle>{t('thumbnail.mediaActionsTitle')}</AlertTitle>
              <AlertDescription>{t('thumbnail.mediaActionsDescription')}</AlertDescription>
            </Alert>

            <Controller
              control={form.control}
              name="thumbnail_type"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel className="text-base font-semibold">{t('thumbnailType')}</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={thumbnailTypeItems}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {thumbnailTypeItems.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <ThumbnailUpdate thumbnailType={thumbnailType} />
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default EditCourseGeneral;
