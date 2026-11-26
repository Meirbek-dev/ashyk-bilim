import { describe, expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

const [email, hint, taken, agree, terms, choice, first] = [
  'Email',
  'Used for receipts',
  'This email is taken',
  'I agree',
  'Read the terms first',
  'Choice',
  'First',
]

describe('Field', () => {
  test('names, describes and marks an input invalid by the field alone', async () => {
    const screen = await renderInRouter(
      <Field invalid>
        <FieldLabel>{email}</FieldLabel>
        <Input />
        <FieldDescription>{hint}</FieldDescription>
        <FieldError>{taken}</FieldError>
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: email })
    await expect.element(input).toHaveAccessibleDescription(`${hint} ${taken}`)
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect.element(screen.getByText(taken)).toBeVisible()
    await userEvent.click(screen.getByText(email))
    expect(document.activeElement).toBe(input.element())
  })

  test('a valid field shows no error and leaves the input unmarked', async () => {
    const screen = await renderInRouter(
      <Field invalid={false}>
        <FieldLabel>{email}</FieldLabel>
        <Input />
        <FieldError />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: email })
    await expect.element(input).toBeVisible()
    expect(input.element().getAttribute('aria-invalid')).not.toBe('true')
    expect(screen.getByText(taken).query()).toBeNull()
  })

  test('a checkbox takes the label beside it, and the label toggles it', async () => {
    const screen = await renderInRouter(
      <Field orientation="horizontal">
        <Checkbox />
        <FieldContent>
          <FieldLabel>{agree}</FieldLabel>
          <FieldDescription>{terms}</FieldDescription>
        </FieldContent>
      </Field>,
    )
    const box = screen.getByRole('checkbox', { name: agree })
    await expect.element(box).toHaveAccessibleDescription(terms)
    await expect.element(box).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByText(agree))
    await expect.element(box).toHaveAttribute('aria-checked', 'true')
  })

  test('a native select joins the field', async () => {
    const screen = await renderInRouter(
      <Field invalid>
        <FieldLabel>{choice}</FieldLabel>
        <NativeSelect>
          <NativeSelectOption value="1">{first}</NativeSelectOption>
        </NativeSelect>
        <FieldError>{taken}</FieldError>
      </Field>,
    )
    const select = screen.getByRole('combobox', { name: choice })
    await expect.element(select).toHaveAccessibleDescription(taken)
    await expect.element(select).toHaveAttribute('aria-invalid', 'true')
  })
})
