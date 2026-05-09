'use client';
import { Field, FieldContent, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller, useForm } from 'react-hook-form';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { constructAcceptValue } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import * as v from 'valibot';

const SUPPORTED_FILES = constructAcceptValue(['pdf']);
const MAX_PDF_FILE_SIZE = 100 * 1024 * 1024;

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('documentNameRequired'))),
    file: v.instance(File, t('pdfFileRequired')),
  });

interface FormValues {
  name: string;
  file: File;
}

type SubmitValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const DocumentPdfModal = ({ submitFileActivity, chapterId, course }: any) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.DocumentPdfModal');
  const validationSchema = createValidationSchema(validationT);

  const form = useForm<FormValues, any, SubmitValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
    },
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onSubmit = async (values: SubmitValues) => {
    await submitFileActivity({
      file: values.file,
      type: 'documentpdf',
      activity: {
        name: values.name,
        chapter_id: chapterId,
        activity_type: 'TYPE_DOCUMENT',
        activity_sub_type: 'SUBTYPE_DOCUMENT_PDF',
      },
      chapterId,
    });
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <Field>
        <FieldLabel htmlFor="name">{t('pdfDocumentName')}</FieldLabel>
        <FieldContent>
          <Input
            id="name"
            type="text"
            {...form.register('name')}
          />
        </FieldContent>
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      <Controller
        control={form.control}
        name="file"
        render={({ field: { onChange, value, name }, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={name}>{t('pdfDocumentFile')}</FieldLabel>
            <FieldContent>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  id={name}
                  name={name}
                  type="file"
                  accept={SUPPORTED_FILES}
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0];

                    if (!nextFile) {
                      onChange(undefined);
                      return;
                    }

                    if (nextFile.size > MAX_PDF_FILE_SIZE) {
                      form.setError('file', {
                        type: 'manual',
                        message: t('fileTooLarge'),
                      });
                      e.target.value = '';
                      onChange(undefined);
                      return;
                    }

                    form.clearErrors('file');
                    onChange(nextFile);
                  }}
                  className="sr-only"
                  aria-label={t('ariaLabel')}
                />
                <div className="border-input bg-background ring-offset-background flex min-h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-offset-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('selectFile')}
                  </Button>
                  <span className="text-muted-foreground truncate pl-3">
                    {value ? value.name : t('noFileSelected')}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">{t('supportedFormats')}</p>
              </div>
            </FieldContent>
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

export default DocumentPdfModal;
