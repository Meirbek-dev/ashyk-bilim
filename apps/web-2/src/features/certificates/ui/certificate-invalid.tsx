import { useNavigate } from '@tanstack/react-router'
import { BadgeX } from 'lucide-react'
import { useId, type FormEvent } from 'react'

import { m } from '#/paraglide/messages'
import { StatusScreen } from '#/shared/components/status-screen'
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
    // The code comes from the URL: however long and unbroken, it wraps instead of widening the page.
    <div className="[&_p]:wrap-anywhere">
      <StatusScreen title={m.certificates_not_found()} text={m.certificates_not_found_hint({ code })}>
        <div className="flex w-full flex-col items-start gap-5">
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <BadgeX aria-hidden className="size-4 shrink-0" />
            {m.certificates_invalid()}
          </p>
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
        </div>
      </StatusScreen>
    </div>
  )
}
