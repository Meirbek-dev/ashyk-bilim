'use client';

import { buildCourseWorkspacePath, cleanCourseUuid, prefixedCourseUuid } from '@/lib/course-management';
import { createNewCourse, getCourseMetadata, searchEditableCourses } from '@services/courses/courses';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { CourseChoiceCard, courseWorkflowSummaryCardClass } from './courseWorkflowUi';
import { CheckCircle2, ChevronDown, Loader2, Search, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourseWizardValues } from '@/schemas/courseSchemas';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { courseWizardSchema } from '@/schemas/courseSchemas';
import { useRouter, useSearchParams } from 'next/navigation';
import { createChapter } from '@services/courses/chapters';
import { RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type * as v from 'valibot';

export default function CourseCreationWizard() {
  const t = useTranslations('DashPage.CourseManagement.Wizard');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  type CourseWizardInputValues = v.InferInput<typeof courseWizardSchema>;

  const form = useForm<CourseWizardInputValues, any, CourseWizardValues>({
    resolver: valibotResolver(courseWizardSchema),
    defaultValues: {
      name: '',
      description: '',
      public: false,
      template: 'blank',
      sourceCourseUuid: '',
    },
  });

  const name = useWatch({ control: form.control, name: 'name', defaultValue: '' });
  const description = useWatch({ control: form.control, name: 'description', defaultValue: '' });
  const template = useWatch({ control: form.control, name: 'template', defaultValue: 'blank' });
  const sourceCourseUuid = useWatch({ control: form.control, name: 'sourceCourseUuid', defaultValue: '' });
  const isPublic = useWatch({ control: form.control, name: 'public', defaultValue: false });

  // ── Async source-course combobox ──────────────────────────────────────────
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceOptions, setSourceOptions] = useState<{ course_uuid: string; name: string; cleanUuid: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSourceName, setSelectedSourceName] = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSourceSearch = useCallback((query: string) => {
    setSourceQuery(query);

    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchEditableCourses(query, 20);
        setSourceOptions(
          results.map((c: any) => ({
            course_uuid: c.course_uuid,
            name: c.name,
            cleanUuid: cleanCourseUuid(c.course_uuid) ?? c.course_uuid,
          })),
        );
      } catch {
        // ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Trigger initial load when outline panel opens
  useEffect(() => {
    if (template === 'outline' && sourceOptions.length === 0) {
      handleSourceSearch('');
    }
  }, [template, sourceOptions.length, handleSourceSearch]);

  useEffect(() => {
    const templateParam = searchParams.get('tpl');
    const sourceParam = searchParams.get('src');

    if (templateParam === 'outline' || templateParam === 'starter' || templateParam === 'blank') {
      form.setValue('template', templateParam);
      setShowAdvancedOptions(templateParam !== 'blank');
    }

    if (sourceParam?.trim()) {
      form.setValue('sourceCourseUuid', cleanCourseUuid(sourceParam));
      form.setValue('template', 'outline');
      setShowAdvancedOptions(true);
    }
  }, [form, searchParams]);

  const canCreate =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    (template !== 'outline' || Boolean(sourceCourseUuid?.trim()));

  const createOutlineFromSource = async (createdCourse: any) => {
    if (!sourceCourseUuid) return;
    const sourceMetadata = await getCourseMetadata(prefixedCourseUuid(sourceCourseUuid), undefined, true);
    const chapters = Array.isArray(sourceMetadata?.chapters) ? sourceMetadata.chapters : [];
    for (const chapter of chapters) {
      await createChapter({
        name: chapter.name || t('importedChapterName'),
        description: chapter.description || t('importedChapterDescription'),
        thumbnail_image: '',
        course_uuid: createdCourse.course_uuid,
      });
    }
  };

  const handleCreate = form.handleSubmit(async (values) => {
    try {
      const result = await createNewCourse(
        {
          name: values.name.trim(),
          description: values.description.trim(),
          learnings: JSON.stringify([]),
          tags: JSON.stringify([]),
          visibility: values.public,
          template: values.template !== 'outline' ? values.template : undefined,
        },
        null,
      );

      const createdCourse = result.data;

      if (!result.success || !createdCourse || !('course_uuid' in createdCourse)) {
        const detail =
          createdCourse && typeof createdCourse === 'object' && 'detail' in createdCourse
            ? createdCourse.detail
            : undefined;
        throw new Error((typeof detail === 'string' ? detail : undefined) || t('errors.creationFailed'));
      }

      if (values.template === 'outline') {
        await createOutlineFromSource(createdCourse);
      }

      const destination = buildCourseWorkspacePath(createdCourse.course_uuid, 'curriculum');
      toast.success(t('toasts.created'));
      router.replace(destination);
    } catch (error: any) {
      toast.error(error?.message || t('errors.createWorkspace'));
    }
  });

  const summaryContent = (
    <div className="text-muted-foreground space-y-4 text-sm">
      <div>
        <div className="text-muted-foreground">{t('summary.title')}</div>
        <div className="text-foreground mt-1 text-base font-semibold">{name.trim() || t('summary.untitledCourse')}</div>
      </div>
      <div>
        <div className="text-muted-foreground">{t('summary.visibility')}</div>
        <div className="mt-1">{isPublic ? t('visibility.public.summary') : t('visibility.private.summary')}</div>
      </div>
      <div>
        <div className="text-muted-foreground">{t('summary.template')}</div>
        <div className="mt-1">
          {template === 'blank'
            ? t('template.blank.title')
            : template === 'starter'
              ? t('template.starter.title')
              : t('template.outline.title')}
        </div>
      </div>
      {template === 'outline' && sourceCourseUuid ? (
        <div>
          <div className="text-muted-foreground">{t('summary.sourceCourse')}</div>
          <div className="mt-1">{selectedSourceName || t('summary.selectedOutlineCourse')}</div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="bg-background min-h-screen px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('header.label')}
          </div>
          <h1 className="text-foreground mt-2 text-4xl font-semibold tracking-tight">{t('header.title')}</h1>
          <p className="text-muted-foreground mt-3 max-w-3xl text-sm leading-6">{t('header.description')}</p>
        </div>

        <div className="xl:hidden">
          <Collapsible>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="group bg-card text-foreground flex w-full items-center justify-between rounded-t-xl border px-5 py-4"
                />
              }
            >
              <span className="text-sm font-semibold">{t('summary.heading')}</span>
              <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="bg-card text-foreground rounded-b-xl border border-t-0 px-5 pb-5">
              {summaryContent}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.8fr]">
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="space-y-5">
              <div>
                <div className="text-foreground text-sm font-semibold">{t('steps.basics')}</div>
                <div className="text-muted-foreground mt-1 text-sm">{t('basics.description')}</div>
              </div>
              <Field>
                <FieldLabel htmlFor="course-title">{t('basics.courseTitle')}</FieldLabel>
                <FieldContent>
                  <Input
                    id="course-title"
                    {...form.register('name')}
                    placeholder={t('basics.courseTitlePlaceholder')}
                  />
                </FieldContent>
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="course-description">{t('basics.shortDescription')}</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="course-description"
                    {...form.register('description')}
                    placeholder={t('basics.shortDescriptionPlaceholder')}
                    className="min-h-32"
                  />
                </FieldContent>
                <FieldError errors={[form.formState.errors.description]} />
              </Field>

              <fieldset className="space-y-3">
                <legend className="text-foreground text-sm font-medium">{t('basics.audienceDefault')}</legend>
                <RadioGroup
                  value={isPublic ? 'public' : 'private'}
                  onValueChange={(val) => form.setValue('public', val === 'public')}
                  className="grid gap-3 md:grid-cols-2"
                >
                  {[
                    {
                      value: 'private',
                      title: t('visibility.private.title'),
                      description: t('visibility.private.description'),
                    },
                    {
                      value: 'public',
                      title: t('visibility.public.title'),
                      description: t('visibility.public.description'),
                    },
                  ].map((option) => (
                    <CourseChoiceCard
                      key={option.value}
                      id={`vis-${option.value}`}
                      value={option.value}
                      checked={(isPublic ? 'public' : 'private') === option.value}
                      title={option.title}
                      description={option.description}
                      icon={option.value === 'public' ? CheckCircle2 : Sparkles}
                      onSelect={(value) => form.setValue('public', value === 'public')}
                    />
                  ))}
                </RadioGroup>
              </fieldset>

              <Collapsible
                open={showAdvancedOptions}
                onOpenChange={setShowAdvancedOptions}
              >
                <CollapsibleTrigger
                  render={
                    <button
                      type="button"
                      className="group bg-muted/30 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left"
                    />
                  }
                >
                  <div>
                    <div className="text-foreground text-sm font-semibold">{t('steps.template')}</div>
                    <div className="text-muted-foreground text-sm">{t('template.description')}</div>
                  </div>
                  <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-open:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="bg-card mt-4 space-y-5 rounded-xl border p-4">
                  <RadioGroup
                    value={template}
                    onValueChange={(val) => form.setValue('template', val as CourseWizardValues['template'])}
                    className="grid gap-3"
                  >
                    {[
                      {
                        value: 'blank',
                        title: t('template.blank.title'),
                        description: t('template.blank.description'),
                      },
                      {
                        value: 'starter',
                        title: t('template.starter.title'),
                        description: t('template.starter.description'),
                      },
                      {
                        value: 'outline',
                        title: t('template.outline.title'),
                        description: t('template.outline.description'),
                      },
                    ].map((option) => (
                      <CourseChoiceCard
                        key={option.value}
                        id={`tpl-${option.value}`}
                        value={option.value}
                        checked={template === option.value}
                        title={option.title}
                        description={option.description}
                        icon={
                          option.value === 'outline'
                            ? ChevronDown
                            : option.value === 'starter'
                              ? Sparkles
                              : CheckCircle2
                        }
                        onSelect={(value) => form.setValue('template', value as CourseWizardValues['template'])}
                      />
                    ))}
                  </RadioGroup>

                  {template === 'outline' ? (
                    <div className="space-y-2">
                      <label
                        htmlFor="source-course-search"
                        className="text-foreground text-sm font-medium"
                      >
                        {t('template.sourceCourse')}
                      </label>

                      {/* Async search input */}
                      <div className="relative">
                        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input
                          id="source-course-search"
                          value={sourceQuery}
                          onChange={(e) => handleSourceSearch(e.target.value)}
                          placeholder={t('template.selectCourse')}
                          className="pl-9"
                        />
                        {isSearching && (
                          <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
                        )}
                      </div>

                      {/* Results list */}
                      {sourceOptions.length > 0 && (
                        <div className="bg-popover max-h-48 overflow-y-auto rounded-lg border shadow-md">
                          {sourceOptions.map((course) => (
                            <button
                              key={course.course_uuid}
                              type="button"
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                                sourceCourseUuid === course.cleanUuid && 'bg-accent font-medium',
                              )}
                              onClick={() => {
                                form.setValue('sourceCourseUuid', course.cleanUuid);
                                setSelectedSourceName(course.name);
                                setSourceQuery(course.name);
                              }}
                            >
                              {course.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {sourceCourseUuid && (
                        <p className="text-muted-foreground text-xs">{t('template.sourceCourseHelp')}</p>
                      )}
                    </div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="mt-8 flex items-center justify-between border-t pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dash/courses')}
                disabled={form.formState.isSubmitting}
              >
                {tCommon('cancel')}
              </Button>

              <Button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {t('actions.createWorkspace')}
              </Button>
            </div>
          </div>

          <div className="hidden xl:block">
            <div className={cn('sticky top-6', courseWorkflowSummaryCardClass)}>
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('summary.heading')}
              </div>
              <div className="mt-4">{summaryContent}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
