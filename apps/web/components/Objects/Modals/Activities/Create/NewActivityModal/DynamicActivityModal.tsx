'use client';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { useForm } from 'react-hook-form';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import * as v from 'valibot';

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('activityNameRequired'))),
    description: v.pipe(v.string(), v.minLength(1, t('activityDescriptionRequired'))),
  });

interface FormValues {
  name: string;
  description: string;
}

type SubmitValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const DynamicCanvaModal = ({ submitActivity, chapterId, course }: any) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.DynamicCanvaModal');
  const validationSchema = createValidationSchema(validationT);

  const form = useForm<FormValues, any, SubmitValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const onSubmit = async (values: SubmitValues) => {
    await submitActivity({
      name: values.name,
      chapter_id: chapterId,
      activity_type: 'TYPE_DYNAMIC',
      activity_sub_type: 'SUBTYPE_DYNAMIC_PAGE',
    });
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Field>
        <FieldLabel htmlFor="name">{t('activityName')}</FieldLabel>
        <FieldContent>
          <Input
            id="name"
            type="text"
            {...form.register('name')}
          />
        </FieldContent>
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">{t('activityDescription')}</FieldLabel>
        <FieldContent>
          <Textarea
            id="description"
            {...form.register('description')}
          />
        </FieldContent>
        <FieldError errors={[form.formState.errors.description]} />
      </Field>

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

export default DynamicCanvaModal;
