import { useNavigate } from '@tanstack/react-router'
import { BadgeX } from 'lucide-react'
import { useId, type FormEvent } from 'react'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { Button } from '#/shared/ui/button'
import { Field, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'

/**
 * An unknown code: the certificate is not valid. The API does not tell "never issued" from "withdrawn". A mistyped
 * code is checked again from here (B-CRT-08): the field opens the verify page of what was typed.
 */
export function CertificateInvalid({ code }: { code: string }) {
  const navigate = useNavigate()
  const id = useId()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('code')
    const typed = typeof value === 'string' ? value.trim() : ''
    if (typed) void navigate({ to: '/certificates/$certificateId/verify', params: { certificateId: typed } })
  }
  return (
    <section className="flex flex-col items-start gap-gutter">
      <div className="flex flex-col items-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{m.certificates_not_found()}</h1>
          <StatusBadge tone="destructive">
            <BadgeX aria-hidden className="size-3" />
            {m.certificates_invalid()}
          </StatusBadge>
        </div>
        <p className="max-w-prose wrap-anywhere">{m.certificates_not_found_hint({ code })}</p>
      </div>
      <form noValidate onSubmit={submit} className="flex w-full max-w-md flex-col gap-2">
        <Field>
          <FieldLabel htmlFor={id}>{m.certificates_check_label()}</FieldLabel>
          <div className="flex gap-2">
            <Input id={id} name="code" defaultValue={code} autoComplete="off" spellCheck={false} />
            <Button type="submit" variant="secondary">
              {m.certificates_check()}
            </Button>
          </div>
        </Field>
      </form>
    </section>
  )
}
