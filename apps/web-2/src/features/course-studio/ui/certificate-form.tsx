import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Certification, Course } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import {
  CERTIFICATE_TYPES,
  certificateConfig,
  certificateFields,
  certificateFieldsSchema,
  type CertificateType,
} from '../model/studio'
import { updateCertificationOptions } from '../queries'
import { DisableCertificate } from './disable-certificate'

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

/** The certificate's name, type and teacher name, written into `config` over the keys this page does not edit. */
export function CertificateForm({ course, certification }: CertificateFormProps) {
  const update = useMutation(updateCertificationOptions(useQueryClient(), course.id))
  const [defaultValues] = useState(() => certificateFields(certification.config))
  const form = useAppForm(certificateFieldsSchema, {
    defaultValues,
    onSubmit: fields =>
      update.mutateAsync(
        { path: { id: certification.id }, body: { config: certificateConfig(certification.config, fields) } },
        { onSuccess: () => toast(m.studio_saved()) },
      ),
  })
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title={m.studio_certificate_title()}
        description={m.studio_certificate_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={update.error}
      >
        <form.AppField name="certification_name">
          {field => (
            <field.TextField label={m.studio_certificate_name()} description={m.studio_certificate_name_hint()} />
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
      {certification.allowed_actions.includes('delete') ? (
        <DisableCertificate course={course} certification={certification} />
      ) : null}
    </div>
  )
}
