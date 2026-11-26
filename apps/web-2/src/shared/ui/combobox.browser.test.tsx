import { useState } from 'react'
import { describe, expect, test } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { renderInRouter } from '#/shared/components/testing'

import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from './combobox'

const fruits = { apple: 'Apple', banana: 'Banana', cherry: 'Cherry' } as const
const order = ['apple', 'banana', 'cherry'] as const
type Fruit = keyof typeof fruits
const [fruitLabel, clearLabel, showLabel, listLabel, empty] = [
  'Fruit',
  'Clear',
  'Show fruits',
  'Fruits',
  'Nothing found',
]

function Picker() {
  const [value, setValue] = useState<Fruit | null>(null)
  return (
    <>
      <Combobox<Fruit> value={value} onValueChange={setValue} itemToLabel={fruit => (fruit ? fruits[fruit] : '')}>
        <ComboboxInput aria-label={fruitLabel}>
          <ComboboxClear aria-label={clearLabel} />
          <ComboboxTrigger aria-label={showLabel} />
        </ComboboxInput>
        <ComboboxContent>
          <ComboboxEmpty>{empty}</ComboboxEmpty>
          <ComboboxList aria-label={listLabel}>
            {order.map(fruit => (
              <ComboboxItem key={fruit} value={fruit} label={fruits[fruit]}>
                {fruits[fruit]}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <output data-testid="value">{value ?? 'none'}</output>
    </>
  )
}

describe('Combobox', () => {
  test('typing filters, Enter selects, the clear button empties it', async () => {
    const screen = await renderInRouter(<Picker />)
    const input = screen.getByRole('combobox', { name: fruitLabel })
    await input.click()
    await userEvent.keyboard('ban')
    await expect.element(page.getByRole('option', { name: 'Banana' })).toBeVisible()
    await expect.element(page.getByRole('option', { name: 'Apple' })).not.toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect.element(input).toHaveValue('Banana')
    await expect.element(screen.getByTestId('value')).toHaveTextContent('banana')
    await screen.getByRole('button', { name: clearLabel }).click()
    await expect.element(input).toHaveValue('')
    await expect.element(screen.getByTestId('value')).toHaveTextContent('none')
  })
})
