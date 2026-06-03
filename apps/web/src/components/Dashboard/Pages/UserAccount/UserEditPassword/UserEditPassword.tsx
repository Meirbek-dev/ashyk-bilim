'use client'

import { updatePassword } from '@/lib/users/client'
import { logout } from '@services/auth/auth'
import { useSession } from '@/hooks/useSession'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import PasswordInput from '@components/ui/custom/password-input'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { getAbsoluteUrl } from '@services/config/config'
import { Button } from '@components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as v from 'valibot'

const createValidationSchema = (t: (key: string, values?: AppTranslationValues) => string) =>
  v.object({
    old_password: v.pipe(
      v.string(),
      v.minLength(
        1,
        t('Form.requiredField', {
          fieldName: t('currentPasswordLabel'),
        }),
      ),
    ),
    new_password: v.pipe(
      v.string(),
      v.minLength(
        1,
        t('Form.requiredField', {
          fieldName: t('newPasswordLabel'),
        }),
      ),
      v.minLength(8, t('Form.minChars', { count: 8 })),
    ),
  })

type PasswordFormData = v.InferOutput<ReturnType<typeof createValidationSchema>>
type PasswordFormValues = v.InferInput<ReturnType<typeof createValidationSchema>>

const UserEditPassword = () => {
  const { user: viewer } = useSession()
  const t = useTranslations('DashPage.Notifications')
  const tPassword = useTranslations('DashPage.UserAccountSettings.UserAccount.EditPassword')
  const validationSchema = createValidationSchema(t)

  const form = useForm<PasswordFormValues, unknown, PasswordFormData>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      old_password: '',
      new_password: '',
    },
  })

  const onSubmit = async (values: PasswordFormData) => {
    const loadingToast = toast.loading(t('updating'))
    try {
      const user_id = viewer?.id
      if (!user_id) {
        toast.error(t('passwordUpdateError'), { id: loadingToast })
        return
      }

      const response = await updatePassword(user_id, values)

      if (response.success) {
        toast.dismiss(loadingToast)

        // Show success message and notify about logout
        toast.success(t('passwordUpdateSuccess'), {
          duration: 4000,
        })
        toast(t('promptLogoutOnPasswordChange'), {
          duration: 4000,
          icon: '🔑',
        })
        form.reset()

        // Wait for 4 seconds before signing out
        setTimeout(() => {
          void logout({ redirectTo: getAbsoluteUrl('/') })
        }, 4000)
      } else {
        toast.error(t('passwordUpdateError'), {
          id: loadingToast,
        })
      }
    } catch (error: unknown) {
      toast.error(t('passwordUpdateError'), { id: loadingToast })
      console.error('Password update error:', error)
    }
  }

  return (
    <div className="bg-background flex flex-col gap-6 px-4 pb-8 md:px-8">
      <div className="bg-card border-border/80 mx-auto w-full max-w-2xl rounded-2xl border p-6 shadow-2xs md:p-8">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Field>
            <FieldLabel htmlFor="old_password">{tPassword('currentPasswordLabel')}</FieldLabel>
            <FieldContent>
              <PasswordInput id="old_password" {...form.register('old_password')} />
            </FieldContent>
            <FieldError errors={[form.formState.errors.old_password]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="new_password">{tPassword('newPasswordLabel')}</FieldLabel>
            <FieldContent>
              <PasswordInput id="new_password" {...form.register('new_password')} />
            </FieldContent>
            <FieldDescription>{tPassword('logoutWarning')}</FieldDescription>
            <FieldError errors={[form.formState.errors.new_password]} />
          </Field>

          <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
            <AlertTriangle size={16} />
            <span className="text-sm">{tPassword('logoutWarning')}</span>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? tPassword('updatingButton') : tPassword('updateButton')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UserEditPassword
