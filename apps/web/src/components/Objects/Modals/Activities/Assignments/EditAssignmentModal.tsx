'use client';
import { useQueryClient } from '@tanstack/react-query';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller, useForm } from 'react-hook-form';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { updateAssignment } from '@services/courses/assignments';
import { queryKeys } from '@/lib/react-query/queryKeys';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { valibotResolver } from '@hookform/resolvers/valibot';
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
import type { FC } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';

interface Assignment {
  assignment_uuid: string;
  title: string;
  description: string;
  due_date?: string;
  grading_type?: 'NUMERIC' | 'PERCENTAGE';
}

interface EditAssignmentFormProps {
  onClose: () => void;
  assignment: Assignment;
}

interface EditAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
}

interface FormValues {
  title: string;
  description: string;
  due_date: string;
  grading_type: 'NUMERIC' | 'PERCENTAGE';
}

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    title: v.pipe(v.string(), v.minLength(1, t('assignmentTitleRequired'))),
    description: v.pipe(v.string(), v.minLength(1, t('assignmentDescriptionRequired'))),
    due_date: v.string(),
    grading_type: v.picklist(['NUMERIC', 'PERCENTAGE']),
  });

type EditAssignmentInput = v.InferInput<ReturnType<typeof createValidationSchema>>;
type EditAssignmentOutput = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const EditAssignmentForm: FC<EditAssignmentFormProps> = ({ onClose, assignment }) => {
  const queryClient = useQueryClient();
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.EditAssignmentModal');
  const fullLocale = useLocale();
  const locale = fullLocale.split('-')[0] ?? 'ru';
  const validationSchema = createValidationSchema(validationT);

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

  const form = useForm<EditAssignmentInput, any, EditAssignmentOutput>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      title: assignment.title || '',
      description: assignment.description || '',
      due_date: assignment.due_date || '',
      grading_type: assignment.grading_type || 'NUMERIC',
    },
  });

  const onSubmit = async (values: EditAssignmentOutput) => {
    const toastLoading = toast.loading(t('updateLoading'));
    try {
      const res = await updateAssignment(values, assignment.assignment_uuid);
      if (res.success) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignment.assignment_uuid) });
        toast.success(t('updateSuccess'));
        onClose();
      } else {
        toast.error(t('updateError'));
      }
    } catch {
      toast.error(t('updateErrorGeneric'));
    } finally {
      toast.dismiss(toastLoading);
    }
  };

  const gradingTypes = [
    { value: 'NUMERIC', label: t('numeric') },
    { value: 'PERCENTAGE', label: t('percentage') },
  ];

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Controller
        control={form.control}
        name="title"
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
        name="due_date"
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
        name="grading_type"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>{t('gradingType')}</FieldLabel>
            <NativeSelect
              onChange={(event) => field.onChange(event.target.value)}
              value={field.value}
              className="w-full"
              aria-label={validationT('selectGradingType')}
            >
              {gradingTypes.map((item) => (
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

      <div className="mt-6 flex justify-end space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
        >
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <BarLoader
              cssOverride={{ borderRadius: 60 }}
              width={30}
              color="#ffffff"
            />
          ) : (
            t('saveChanges')
          )}
        </Button>
      </div>
    </form>
  );
};

const EditAssignmentModal: FC<EditAssignmentModalProps> = ({ isOpen, onClose, assignment }) => {
  const t = useTranslations('Components.EditAssignmentModal');
  return (
    <Modal
      isDialogOpen={isOpen}
      onOpenChange={onClose}
      minHeight="md"
      minWidth="lg"
      dialogContent={
        <EditAssignmentForm
          onClose={onClose}
          assignment={assignment}
        />
      }
      dialogTitle={t('editAssignment')}
      dialogDescription={t('updateDetails')}
      dialogTrigger={undefined}
    />
  );
};

export default EditAssignmentModal;
