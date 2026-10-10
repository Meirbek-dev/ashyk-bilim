import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Certification, Course } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/course'
import {
  CERTIFICATE_TYPES,
  certificateConfig,
  certificateFields,
  certificateFieldsSchema,
  type CertificateFields,
  type CertificateType,
} from '../model/studio'
import { certificationVersion, updateCertificationOptions } from '../queries'
import { CertificatePreview } from './certificate-preview'
import { DisableCertificate } from './disable-certificate'
import { useIfMatch } from './use-if-match'

// The type keys the server prints on the PDF (certifications/pdf.rs `type_label`).
const typeLabels: Record<CertificateType, () => string> = {
  completion: m.studio_certificate_type_completion,
  achievement: m.studio_certificate_type_achievement,
  assessment: m.studio_certificate_type_assessment,
  participation: m.studio_certificate_type_participation,
  mastery: m.studio_certificate_type_mastery,
  professional: m.studio_certificate_type_professional,
  continuing: m.studio_certificate_type_continuing,
  specialization: m.studio_certificate_type_specialization,
}
const typeOptions = CERTIFICATE_TYPES.map(value => ({ value, label: typeLabels[value]() }))

type CertificateFormProps = { course: Course; certification: Certification }

/** Settings for the automatic certificate; unrelated legacy config keys survive a save. */
export function CertificateForm({ course, certification }: CertificateFormProps) {
  const queryClient = useQueryClient()
  const update = useMutation(updateCertificationOptions(queryClient, course.id))
  const [defaultValues] = useState(() => certificateFields(certification.config))
  const write = useIfMatch(
    (fields: CertificateFields, version: number) =>
      update.mutateAsync(
        {
          path: { certification_id: certification.id },
          body: { config: certificateConfig(certification.config, fields) },
          headers: { 'If-Match': version },
        },
        { onSuccess: () => toast.add({ title: m.studio_saved() }) },
      ),
    () => certificationVersion(queryClient, course.id, certification),
  )
  const form = useAppForm(certificateFieldsSchema, {
    defaultValues,
    onSubmit: fields => write.save(fields, certification.version),
  })
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title={m.studio_certificate_title()}
        description={m.studio_certificate_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="certification_name">
          {field => (
            <field.TextField label={m.studio_certificate_name()} description={m.studio_certificate_name_hint()} />
          )}
        </form.AppField>
        <form.AppField name="course_start">
          {field => <field.TextField type="date" label={m.studio_certificate_start()} />}
        </form.AppField>
        <form.AppField name="course_end">
          {field => <field.TextField type="date" label={m.studio_certificate_end()} />}
        </form.AppField>
        <form.AppField name="training_hours">
          {field => (
            <field.TextField
              inputMode="numeric"
              label={m.studio_certificate_hours()}
              description={m.studio_certificate_optional_hint()}
            />
          )}
        </form.AppField>
        <form.AppField name="certification_type">
          {field => <field.SelectField label={m.studio_certificate_type()} options={typeOptions} />}
        </form.AppField>
        <form.AppField name="certificate_instructor">
          {field => (
            <field.TextField
              label={m.studio_certificate_instructor()}
              description={m.studio_certificate_instructor_hint()}
            />
          )}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
      <CertificatePreview certification={certification} />
      {certification.allowed_actions.includes('delete') ? (
        <DisableCertificate course={course} certification={certification} />
      ) : null}
    </div>
  )
}
