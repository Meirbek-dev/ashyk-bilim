import * as v from 'valibot'

/** `t`: DashPage.Notifications; `tLabels`: DashPage.UserAccountSettings.generalSection (the visible field labels). */
export const createValidationSchema = (t: AppTranslator, tLabels: AppTranslator) =>
  v.object({
    email: v.pipe(
      v.string(),
      v.minLength(1, t('Form.requiredField', { fieldName: tLabels('email') })),
      v.email(t('Form.invalidEmail')),
    ),
    username: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: tLabels('username') }))),
    display_name: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: tLabels('displayName') }))),
    bio: v.optional(v.pipe(v.string(), v.maxLength(400, t('Form.maxChars', { count: 400 })))),

  })

export type FormValues = v.InferOutput<ReturnType<typeof createValidationSchema>>

export interface DetailItem {
  id: string
  label: string
  icon: string
  text: string
}
