import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'

import { certificateConfig, certificateFields } from '../model/studio'
import { certificationsOptions, createCertificationOptions } from '../queries'
import { CertificateForm } from './certificate-form'

/** "Certificate": off (no configuration) offers to switch it on; on shows the fields the server PDF prints. */
export function CertificateSection({ course }: { course: Course }) {
  const { data: certifications } = useSuspenseQuery(certificationsOptions(course.id))
  const create = useMutation(createCertificationOptions(useQueryClient(), course.id))
  const certification = certifications[0]
  if (certification) return <CertificateForm course={course} certification={certification} />
  const enable = () =>
    create.mutate(
      { body: { course_id: course.id, config: certificateConfig({}, certificateFields({})) } },
      { onSuccess: () => toast(m.studio_certificate_enabled()) },
    )
  return (
    <section aria-label={m.studio_certificate_title()} className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.studio_certificate_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.studio_certificate_hint()}</p>
      </div>
      <Button variant="outline" pending={create.isPending} onClick={enable}>
        {m.studio_certificate_enable()}
      </Button>
      {create.error ? <Alert>{presentError(create.error)}</Alert> : null}
    </section>
  )
}
