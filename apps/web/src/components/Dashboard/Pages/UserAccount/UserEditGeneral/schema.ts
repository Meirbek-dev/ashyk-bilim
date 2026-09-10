import * as v from 'valibot'

export const createValidationSchema = (t: AppTranslator) =>
  v.object({
    email: v.pipe(
      v.string(),
      v.minLength(1, t('Form.requiredField', { fieldName: 'Email' })),
      v.email(t('Form.invalidEmail')),
    ),
    username: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'Username' }))),
    display_name: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'Name' }))),
    bio: v.optional(v.pipe(v.string(), v.maxLength(400, t('Form.maxChars', { count: 400 })))),

  })

export type FormValues = v.InferOutput<ReturnType<typeof createValidationSchema>>

export interface DetailItem {
  id: string
  label: string
  icon: string
  text: string
}
