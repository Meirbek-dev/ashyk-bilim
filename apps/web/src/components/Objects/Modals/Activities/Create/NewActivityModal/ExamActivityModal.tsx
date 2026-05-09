'use client';

import { valibotResolver } from '@hookform/resolvers/valibot';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useCreateExamWithActivity, useExamConfig } from '@/features/assessments/hooks/exam';
import { useTranslations } from 'next-intl';
import { cleanActivityUuid, cleanCourseUuid } from '@/lib/course-management';
import { useEffect } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';

import { Field, FieldDescription, FieldError, FieldLabel } from '@components/ui/field';
import { Textarea } from '@components/ui/textarea';
import { Switch } from '@components/ui/switch';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';

const createValidationSchema = (t: (key: string) => string, limits?: any) =>
  v.object({
    exam_title: v.pipe(v.string(), v.minLength(1, t('examTitleRequired'))),
    activity_name: v.pipe(v.string(), v.minLength(1, t('activityNameRequired'))),
    exam_description: v.pipe(v.string(), v.minLength(1, t('examDescriptionRequired'))),
    time_limit: v.optional(
      v.pipe(v.number(), v.minValue(limits?.time_limit?.min ?? 1), v.maxValue(limits?.time_limit?.max ?? 180)),
    ),
    has_time_limit: v.boolean(),
    shuffle_questions: v.boolean(),
    allow_result_review: v.boolean(),
  });

interface FormValues {
  exam_title: string;
  activity_name: string;
  exam_description: string;
  time_limit?: number;
  has_time_limit: boolean;
  shuffle_questions: boolean;
  allow_result_review: boolean;
}

type SubmitValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const getDefaultTimeLimit = (limits?: any) =>
  Math.min(Math.max(50, limits?.time_limit?.min ?? 1), limits?.time_limit?.max ?? 180);

const getCourseUuid = (course: any): string | null =>
  course?.courseStructure?.course_uuid ?? course?.course_uuid ?? course?.course?.course_uuid ?? null;

const getCreatedActivityUuid = (data: any): string | null =>
  data?.activity_uuid ??
  data?.activity?.activity_uuid ??
  data?.data?.activity_uuid ??
  data?.data?.activity?.activity_uuid ??
  null;

const navigateTo = (url: string) => {
  globalThis.location.href = url;
};

const NewExam = ({ chapterId, course, closeModal }: any) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.NewExamModal');

  const { data: limits } = useExamConfig();
  const validationSchema = createValidationSchema(validationT, limits);
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false;
  const courseUuid = getCourseUuid(course);
  const createExamMutation = useCreateExamWithActivity(courseUuid, {
    withUnpublishedActivities,
  });

  const form = useForm<FormValues, any, SubmitValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      exam_title: '',
      activity_name: '',
      exam_description: '',
      has_time_limit: true,
      time_limit: getDefaultTimeLimit(limits),
      shuffle_questions: true,
      allow_result_review: true,
    },
  });

  const hasTimeLimit = useWatch({ control: form.control, name: 'has_time_limit', defaultValue: true });

  useEffect(() => {
    if (!limits) return;

    const currentValue = form.getValues('time_limit');
    const nextValue =
      currentValue === undefined
        ? getDefaultTimeLimit(limits)
        : Math.min(Math.max(currentValue, limits?.time_limit?.min ?? 1), limits?.time_limit?.max ?? 180);

    form.setValue('time_limit', nextValue, { shouldDirty: false, shouldValidate: false });
  }, [form, limits]);

  const onSubmit = async (values: SubmitValues) => {
    const toastLoading = toast.loading(t('creatingExam'));
    try {
      const courseId = course?.courseStructure?.id;
      if (typeof courseId !== 'number') {
        throw new Error('Course metadata is missing for exam creation');
      }

      const settings = {
        time_limit: values.has_time_limit ? values.time_limit : null,
        attempt_limit: 1,
        shuffle_questions: values.shuffle_questions,
        shuffle_answers: true,
        question_limit: null,
        access_mode: 'NO_ACCESS',
        whitelist_user_ids: [],
        allow_result_review: values.allow_result_review,
        show_correct_answers: values.allow_result_review,
        copy_paste_protection: true,
        tab_switch_detection: true,
        devtools_detection: true,
        right_click_disable: true,
        fullscreen_enforcement: true,
        violation_threshold: 3,
      };

      const data = await createExamMutation.mutateAsync({
        activityName: values.activity_name,
        courseId,
        chapterId,
        examTitle: values.exam_title,
        examDescription: values.exam_description,
        settings,
      });

      toast.dismiss(toastLoading);
      toast.success(t('examCreatedSuccessfully'));

      const createdActivityUuid = getCreatedActivityUuid(data);
      if (createdActivityUuid) {
        let courseUuidClean = courseUuid ? cleanCourseUuid(courseUuid) : null;
        if (!courseUuidClean) {
          const parts = globalThis.location.pathname.split('/').filter(Boolean);
          const courseIndex = parts.indexOf('course');
          if (courseIndex !== -1 && parts.length > courseIndex + 1) {
            courseUuidClean = String(parts[courseIndex + 1]);
          }
          const dashCourseIndex = parts.indexOf('courses');
          if (dashCourseIndex !== -1 && parts.length > dashCourseIndex + 1) {
            courseUuidClean = String(parts[dashCourseIndex + 1]);
          }
        }

        if (courseUuidClean) {
          const activityUuidClean = cleanActivityUuid(createdActivityUuid);
          navigateTo(
            `/course/${courseUuidClean}/activity/${activityUuidClean}${
              withUnpublishedActivities ? '?withUnpublishedActivities=true' : ''
            }`,
          );
        } else {
          navigateTo('/courses');
        }
      }

      closeModal();
    } catch (error: any) {
      toast.dismiss(toastLoading);
      toast.error(t('errorCreatingExam'));
      console.error('Error creating exam:', error);
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Field>
        <FieldLabel htmlFor="activity_name">{t('activityName')}</FieldLabel>
        <Input
          id="activity_name"
          placeholder={t('activityNamePlaceholder')}
          {...form.register('activity_name')}
        />
        <FieldDescription>{t('activityNameDescription')}</FieldDescription>
        <FieldError errors={[form.formState.errors.activity_name]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="exam_title">{t('examTitle')}</FieldLabel>
        <Input
          id="exam_title"
          placeholder={t('examTitlePlaceholder')}
          {...form.register('exam_title')}
        />
        <FieldError errors={[form.formState.errors.exam_title]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="exam_description">{t('examDescription')}</FieldLabel>
        <Textarea
          id="exam_description"
          placeholder={t('examDescriptionPlaceholder')}
          {...form.register('exam_description')}
        />
        <FieldError errors={[form.formState.errors.exam_description]} />
      </Field>

      <Controller
        control={form.control}
        name="has_time_limit"
        render={({ field }) => (
          <Field className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FieldLabel>{t('enableTimeLimit')}</FieldLabel>
              <FieldDescription>{t('timeLimitDescription')}</FieldDescription>
            </div>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />

      {hasTimeLimit && (
        <Controller
          control={form.control}
          name="time_limit"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t('timeLimitMinutes')}</FieldLabel>
              <Input
                id={field.name}
                type="number"
                min={limits?.time_limit?.min ?? 1}
                max={limits?.time_limit?.max ?? 180}
                placeholder="60"
                {...field}
                value={field.value ?? ''}
                onChange={(e) => {
                  field.onChange(e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10));
                }}
              />
              <FieldDescription>{t('timeLimitMinutesDescription')}</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      <Controller
        control={form.control}
        name="shuffle_questions"
        render={({ field }) => (
          <Field className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FieldLabel>{t('shuffleQuestions')}</FieldLabel>
              <FieldDescription>{t('shuffleQuestionsDescription')}</FieldDescription>
            </div>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="allow_result_review"
        render={({ field }) => (
          <Field className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FieldLabel>{t('allowResultReview')}</FieldLabel>
              <FieldDescription>{t('allowResultReviewDescription')}</FieldDescription>
            </div>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </Field>
        )}
      />

      <div className="mt-6 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={closeModal}
          disabled={form.formState.isSubmitting}
        >
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? t('creating') : t('createExam')}
        </Button>
      </div>
    </form>
  );
};

export default NewExam;
