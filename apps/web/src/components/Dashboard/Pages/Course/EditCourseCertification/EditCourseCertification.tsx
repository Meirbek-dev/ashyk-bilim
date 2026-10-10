'use client'

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { createCertification, deleteCertification, updateCertification } from '@services/courses/certifications'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { AlertTriangle, Award, CalendarDays, FileText } from 'lucide-react'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { CourseEditorStagedSection } from '@/features/courses/editor/components/CourseEditorSection'
import { useSyncDirtySection } from '@/hooks/useSyncDirtySection'
import { InlineError } from '@/components/ui/error-state'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useCourse } from '@components/Contexts/CourseContext'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { useSaveSection } from '@/hooks/useSaveSection'
import { Separator } from '@/components/ui/separator'
import { CertificatePdfPreview } from '@/features/certifications/components/CertificatePdfPreview'
import { apiBody } from '@/lib/api-client'
import { Spinner } from '@components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useLocale, useTranslations } from 'next-intl'
import * as v from 'valibot'

interface CourseCertificationResource {
  id: string
  version?: number
  config: AppCertification['certification']['config']
}

const CERTIFICATION_TYPES = [
  'completion',
  'achievement',
  'assessment',
  'participation',
  'mastery',
  'professional',
  'continuing',
  'workshop',
  'specialization',
] as const

/** Blank, or a real calendar day `YYYY-MM-DD` (what `<input type="date">` gives). */
const isOptionalDate = (value: string) =>
  value === '' ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value)
const isOptionalHours = (value: string) =>
  value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100_000)

// Module-level type-only schema (no translated messages needed for type inference)
const _certFormSchemaForTypes = v.object({
  enable_certification: v.boolean(),
  certification_name: v.string(),
  certification_type: v.picklist(CERTIFICATION_TYPES),
  certificate_instructor: v.optional(v.string()),
  course_start: v.string(),
  course_end: v.string(),
  training_hours: v.string(),
})

type FormValues = v.InferOutput<typeof _certFormSchemaForTypes>
type FormInputValues = v.InferInput<typeof _certFormSchemaForTypes>

function EditCourseCertification() {
  const [error, setError] = useState('')

  const course = useCourse()
  const { isLoading, courseStructure, editorData } = course

  const t = useTranslations('Certificates.EditCourseCertification')
  const tCommon = useTranslations('Common')

  const certificationTypeItems = useMemo(
    () => CERTIFICATION_TYPES.map(type => ({ value: type, label: t(`certificationTypes.${type}`) })),
    [t],
  )

  // The printed certificate reads the name, type, teacher and the optional training dates / hours
  // (DECISIONS «Automatic bilingual certificates»); the server checks the same rules.
  const formSchema = useMemo(
    () =>
      v.pipe(
        v.object({
          enable_certification: v.boolean(),
          certification_name: v.pipe(
            v.string(t('certificationNameRequired')),
            v.trim(),
            v.minLength(1, t('certificationNameRequired')),
            v.maxLength(100, t('maxCharacters100')),
          ),
          certification_type: v.picklist(CERTIFICATION_TYPES, t('certificationTypeRequired')),
          certificate_instructor: v.optional(v.pipe(v.string(), v.trim())),
          course_start: v.pipe(v.string(), v.trim(), v.check(isOptionalDate, t('invalidDate'))),
          course_end: v.pipe(v.string(), v.trim(), v.check(isOptionalDate, t('invalidDate'))),
          training_hours: v.pipe(v.string(), v.trim(), v.check(isOptionalHours, t('invalidHours'))),
        }),
        v.forward(
          v.partialCheck(
            [['course_start'], ['course_end']],
            ({ course_start, course_end }) => !course_start || !course_end || course_start <= course_end,
            t('endBeforeStart'),
          ),
          ['course_end'],
        ),
      ),
    [t],
  )

  const certifications = (
    Array.isArray(editorData.certifications.data) ? editorData.certifications.data : []
  ) as CourseCertificationResource[]
  const certificationsError = editorData.certifications.error
  const [existingCertification] = certifications
  const hasExistingCertification = Boolean(existingCertification)

  const form = useForm<FormInputValues, unknown, FormValues>({
    resolver: valibotResolver(formSchema),
    defaultValues: {
      enable_certification: false,
      certification_name: '',
      certification_type: 'completion',
      certificate_instructor: '',
      course_start: '',
      course_end: '',
      training_hours: '',
    },
  })

  const getInitialValues = useCallback((): FormValues => {
    // The roster lists the creator first (`creator/active`).
    const getInstructorName = () => editorData.contributors.data?.find(c => c.role === 'creator')?.display_name ?? ''

    const config = (existingCertification?.config ?? {}) as Partial<AppCertification['certification']['config']>
    return {
      enable_certification: hasExistingCertification,
      certification_name: config.certification_name || courseStructure?.name || '',
      certification_type: config.certification_type || 'completion',
      certificate_instructor: config.certificate_instructor || getInstructorName(),
      course_start: config.course_start ?? '',
      course_end: config.course_end ?? '',
      training_hours: config.training_hours ?? '',
    }
  }, [courseStructure, editorData.contributors.data, existingCertification, hasExistingCertification])

  const serverValues = useMemo(() => {
    if (editorData.certifications.data === null || isLoading) {
      return null
    }
    return getInitialValues()
  }, [editorData.certifications.data, getInitialValues, isLoading])

  const serverValuesSignature = useMemo(() => {
    if (!serverValues) return ''
    return JSON.stringify(serverValues)
  }, [serverValues])

  const hydratedServerValuesSignatureRef = useRef('')

  const { isDirty } = form.formState
  useSyncDirtySection('certification', isDirty)

  const handleDiscard = () => {
    if (serverValues) form.reset(serverValues)
    setError('')
  }

  const { isSaving, saveWithEditorRefresh } = useSaveSection({
    section: 'certification',
    errorMessage: t('certificationError'),
    onError: setError,
  })
  const locale = useLocale()

  // Hydrate form from server data on load / when server data changes.
  useEffect(() => {
    if (!serverValues) return
    if (hydratedServerValuesSignatureRef.current === serverValuesSignature) return
    form.reset(serverValues, { keepDirtyValues: true })
    hydratedServerValuesSignatureRef.current = serverValuesSignature
  }, [serverValues, serverValuesSignature, form])

  // Subscribe to individual watched fields to avoid over-rendering
  const isEnabled = useWatch({
    control: form.control,
    name: 'enable_certification',
    defaultValue: false,
  })
  const handleSaveCertification = form.handleSubmit(async values => {
    if (!courseStructure || !isDirty) return

    const isCertificationEnabled = values.enable_certification

    // Keys this form does not edit (an older design, a description) survive the save.
    const config = {
      ...existingCertification?.config,
      certification_name: values.certification_name,
      certification_type: values.certification_type,
      certificate_instructor: values.certificate_instructor ?? '',
      course_start: values.course_start,
      course_end: values.course_end,
      training_hours: values.training_hours,
    }

    setError('')

    await saveWithEditorRefresh(
      async () => {
        if (isCertificationEnabled) {
          if (existingCertification) {
            await updateCertification({
              certification_id: existingCertification.id,
              config,
            })
            return
          }

          await createCertification({
            course_id: courseStructure.course_uuid,
            config,
          })
          return
        }

        if (existingCertification) {
          await deleteCertification(existingCertification.id)
        }

        return { success: true }
      },
      {
        successMessage: isCertificationEnabled
          ? hasExistingCertification
            ? tCommon('saved')
            : t('certificationCreated')
          : t('certificationRemoved'),
        onSuccess: () => {
          form.reset(values)
          setError('')
        },
      },
    )
  })

  if (isLoading || !courseStructure || (course.isEditorDataLoading && editorData.certifications.data === null)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2">
          <Spinner className="size-6" />
          <span>{t('loading')}</span>
        </div>
      </div>
    )
  }

  if (certificationsError) {
    return (
      <InlineError
        className="mx-4 mt-8 sm:mx-10"
        description={certificationsError}
        title={t('errorLoadingCertifications')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <CourseEditorStagedSection
        title={t('courseCertification')}
        description={t('enableCertification')}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSaveCertification}
        onDiscard={handleDiscard}
        headerContent={
          <Controller
            control={form.control}
            name="enable_certification"
            render={({ field }) => (
              <Label htmlFor="cert-toggle" className="cursor-pointer">
                <Switch
                  id="cert-toggle"
                  checked={field.value}
                  onCheckedChange={checked => {
                    field.onChange(checked)
                  }}
                  disabled={isSaving}
                />
              </Label>
            )}
          />
        }
      >
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isEnabled && (
          <div className="space-y-8">
            <div className="grid gap-8 xl:grid-cols-5">
              {/* Configuration */}
              <div className="space-y-8 xl:col-span-3">
                {/* Basic Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="text-muted-foreground h-5 w-5" />
                    <h3 className="text-lg font-semibold">{t('basicInfo')}</h3>
                  </div>
                  <p className="text-muted-foreground text-sm">{t('basicInfoDesc')}</p>
                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="certification_name"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2">
                          <FieldLabel htmlFor={field.name}>{t('certificationName')}</FieldLabel>
                          <FieldContent>
                            <Input id={field.name} {...field} placeholder={t('certificationNamePlaceholder')} />
                          </FieldContent>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="certification_type"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2">
                          <FieldLabel>{t('certificationType')}</FieldLabel>
                          <NativeSelect
                            value={field.value || 'completion'}
                            onChange={event => field.onChange(event.target.value)}
                            className="w-full"
                            aria-label={t('certificationType')}
                          >
                            {certificationTypeItems.map(item => (
                              <NativeSelectOption key={item.value} value={item.value}>
                                {item.label}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="certificate_instructor"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2">
                          <FieldLabel htmlFor={field.name}>{t('certificateInstructor')}</FieldLabel>
                          <FieldContent>
                            <Input id={field.name} {...field} placeholder={t('certificateInstructorPlaceholder')} />
                          </FieldContent>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </div>
                </div>

                {/* Training details printed on the certificate (optional). */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="text-muted-foreground h-5 w-5" />
                    <h3 className="text-lg font-semibold">{t('trainingDetails')}</h3>
                  </div>
                  <p className="text-muted-foreground text-sm">{t('trainingDetailsDesc')}</p>
                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    {(['course_start', 'course_end'] as const).map(name => (
                      <Controller
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel htmlFor={field.name}>
                              {t(name === 'course_start' ? 'courseStart' : 'courseEnd')}
                            </FieldLabel>
                            <FieldContent>
                              <Input id={field.name} type="date" {...field} aria-invalid={fieldState.invalid} />
                            </FieldContent>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    ))}
                    <Controller
                      control={form.control}
                      name="training_hours"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2">
                          <FieldLabel htmlFor={field.name}>{t('trainingHours')}</FieldLabel>
                          <FieldContent>
                            <Input
                              id={field.name}
                              inputMode="numeric"
                              {...field}
                              className="max-w-40"
                              aria-invalid={fieldState.invalid}
                            />
                          </FieldContent>
                          <FieldDescription>{t('optionalHint')}</FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Preview: the server's PDF of the saved settings, exactly what learners download. */}
              <div className="w-full max-w-md xl:col-span-2 xl:max-w-none">
                <div className="sticky top-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Award className="h-4 w-4" />
                        {t('previewCertificate')}
                      </CardTitle>
                      <CardDescription>
                        {existingCertification && !isDirty ? t('pdfPreviewSaved') : t('pdfPreviewUnsaved')}
                      </CardDescription>
                    </CardHeader>
                    {existingCertification && !isDirty ? (
                      <CardContent>
                        <CertificatePdfPreview
                          queryKey={['preview', existingCertification.id, existingCertification.version, locale]}
                          load={() =>
                            apiBody<Blob, 'blob'>(`certifications/${existingCertification.id}/preview.pdf`, {
                              responseType: 'blob',
                              headers: { 'Accept-Language': locale },
                            })
                          }
                          title={t('previewCertificate')}
                        />
                      </CardContent>
                    ) : null}
                  </Card>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isEnabled && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-muted mb-4 rounded-full p-6">
              <Award className="text-muted-foreground h-12 w-12" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t('noCertificationConfigured')}</h3>
            <p className="text-muted-foreground mb-6 max-w-sm text-sm">{t('noCertificationDescription')}</p>
            <Button
              type="button"
              onClick={() => {
                form.setValue('enable_certification', true, {
                  shouldDirty: true,
                  shouldTouch: true,
                })
              }}
              disabled={isSaving}
            >
              <Award className="h-4 w-4" />
              {t('enableCertificationButton')}
            </Button>
          </div>
        )}
      </CourseEditorStagedSection>
    </div>
  )
}

export default EditCourseCertification
