'use client';
import { useQueryClient } from '@tanstack/react-query';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createAssignmentWithActivity } from '@services/courses/assignments';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller, useForm } from 'react-hook-form';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { revalidateTags } from '@/lib/api-client';
import { de, enUS, es, fr, ru } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRef } from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as v from 'valibot';

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('assignmentTitleRequired'))),
    description: v.pipe(v.string(), v.minLength(1, t('assignmentDescriptionRequired'))),
    dueDate: v.optional(v.string()),
    gradingType: v.picklist(['NUMERIC', 'PERCENTAGE']),
  });

interface FormValues {
  name: string;
  description: string;
  dueDate?: string;
  gradingType: 'NUMERIC' | 'PERCENTAGE';
}

type AssignmentSubmitValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const NewAssignment = ({ submitActivity, chapterId, course, closeModal }: any) => {
  const queryClient = useQueryClient();
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.NewAssignmentModal');
  const fullLocale = useLocale();
  const locale = fullLocale.split('-')[0] ?? 'ru';
  const validationSchema = createValidationSchema(validationT);
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false;

  const gradingTypeItems = [
    { value: 'NUMERIC', label: t('numeric') },
    { value: 'PERCENTAGE', label: t('percentage') },
  ];

  // Get the appropriate date-fns locale
  const getDateFnsLocale = (locale: string) => {
    const localeMap: Record<string, any> = {
      en: enUS,
      es,
      fr,
      de,
      ru,
    };
    return localeMap[locale] || enUS;
  };

  const dateFnsLocale = getDateFnsLocale(locale);
  const todayRef = useRef(
    (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })(),
  );
  const today = todayRef.current;

  const form = useForm<FormValues, any, AssignmentSubmitValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      description: '',
      dueDate: '',
      gradingType: 'NUMERIC',
    },
  });

  const onSubmit = async (values: AssignmentSubmitValues) => {
    const toastLoading = toast.loading(t('creatingAssignment'));
    try {
      const res = await createAssignmentWithActivity({
        body: {
          title: values.name,
          description: values.description,
          due_at: values.dueDate || null,
          grading_type: values.gradingType,
          course_id: course?.courseStructure.id,
          chapter_id: chapterId,
        },
        chapterId,
        activityName: values.name,
      });

      if (res.success) {
        toast.success(t('createSuccess'));

        if (course?.courseStructure?.course_uuid) {
          await queryClient.invalidateQueries({
            queryKey: courseKeys.structure(course.courseStructure.course_uuid, withUnpublishedActivities),
          });
        }

        await revalidateTags(['courses']);
        closeModal();
      } else {
        toast.error(t('createError', { error: res.data?.detail || t('unknownError') }));
      }
    } catch (error: any) {
      console.error('Assignment creation failed:', error);
      toast.error(
        t('createError', {
          error: error?.message || t('unexpectedError'),
        }),
      );
    } finally {
      toast.dismiss(toastLoading);
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>{t('assignmentTitle')}</FieldLabel>
            <FieldContent>
              <Input
                id={field.name}
                type="text"
                {...field}
              />
            </FieldContent>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="description"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>{t('assignmentDescription')}</FieldLabel>
            <FieldContent>
              <Textarea
                id={field.name}
                {...field}
              />
            </FieldContent>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="dueDate"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>{t('dueDate')}</FieldLabel>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !field.value && 'text-muted-foreground',
                    )}
                  />
                }
              >
                {field.value ? (
                  format(new Date(field.value), 'PPP', { locale: dateFnsLocale })
                ) : (
                  <span>{t('selectDeadline')}</span>
                )}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
              >
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  selected={field.value ? new Date(field.value) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const isoDate = `${year}-${month}-${day}`;
                      field.onChange(isoDate);
                    } else {
                      field.onChange('');
                    }
                  }}
                  disabled={{ before: today }}
                  locale={dateFnsLocale}
                />
              </PopoverContent>
            </Popover>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="gradingType"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>{t('gradingType')}</FieldLabel>
            <NativeSelect
              onChange={(event) => field.onChange(event.target.value)}
              value={field.value}
              className="w-full"
              aria-label={validationT('selectGradingType')}
            >
              {gradingTypeItems.map((item) => (
                <NativeSelectOption
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <div className="mt-6 flex justify-end">
        <Button
          type="submit"
          className="mt-2.5"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <BarLoader
              cssOverride={{ borderRadius: 60 }}
              width={60}
              color="#ffffff"
            />
          ) : (
            t('createActivity')
          )}
        </Button>
      </div>
    </form>
  );
};

export default NewAssignment;
