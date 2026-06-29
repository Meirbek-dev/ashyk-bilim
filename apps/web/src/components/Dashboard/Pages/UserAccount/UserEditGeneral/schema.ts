import * as v from 'valibot'

export const createValidationSchema = (t: AppTranslator) =>
  v.object({
    email: v.pipe(
      v.string(),
      v.minLength(1, t('Form.requiredField', { fieldName: 'Email' })),
      v.email(t('Form.invalidEmail')),
    ),
    username: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'Username' }))),
    first_name: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'First name' }))),
    middle_name: v.optional(v.pipe(v.string(), v.maxLength(100, t('Form.maxChars', { count: 100 })))),
    last_name: v.pipe(v.string(), v.minLength(1, t('Form.requiredField', { fieldName: 'Last name' }))),
    bio: v.optional(v.pipe(v.string(), v.maxLength(400, t('Form.maxChars', { count: 400 })))),
    details: v.record(
      v.string(),
      v.object({
        id: v.string(),
        label: v.string(),
        icon: v.string(),
        text: v.string(),
      }),
    ),
  })

export type FormValues = v.InferOutput<ReturnType<typeof createValidationSchema>>

export interface DetailItem {
  id: string
  label: string
  icon: string
  text: string
}
