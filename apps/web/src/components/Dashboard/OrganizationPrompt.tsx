'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field'
import { Input } from '@components/ui/input'
import { useApiError } from '@/hooks/useApiError'
import { updateProfile } from '@/lib/users/client'

/**
 * Accounts created before the organization became a required registration
 * field (or by an admin / Google) have it blank: the dashboard stays behind
 * this undismissable dialog until it is given.
 */
export default function OrganizationPrompt() {
  const t = useTranslations('DashPage.OrganizationPrompt')
  const tSignup = useTranslations('Auth.Signup')
  const tValidation = useTranslations('Validation')
  const router = useRouter()
  const { handleApiError } = useApiError()
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const organization = String(new FormData(event.currentTarget).get('organization') ?? '').trim()
    if (!organization) {
      setFieldError(tValidation('required'))
      return
    }
    setPending(true)
    setFieldError(null)
    try {
      await updateProfile({ organization })
      router.refresh()
    } catch (error) {
      setFieldError(handleApiError(error, { fallback: t('error') }).message)
      setPending(false)
    }
  }

  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field>
            <FieldLabel htmlFor="organization">{tSignup('organization')}</FieldLabel>
            <FieldContent>
              <Input
                id="organization"
                name="organization"
                autoComplete="organization"
                placeholder={tSignup('organizationPlaceholder')}
                maxLength={200}
              />
            </FieldContent>
            <FieldError>{fieldError}</FieldError>
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {t('save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
