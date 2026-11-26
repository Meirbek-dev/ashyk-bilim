import { GripVertical } from 'lucide-react'
import { useState } from 'react'
import { expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { renderInRouter } from '#/shared/components/testing'
import {
  Sortable,
  SortableHandle,
  SortableItem,
  Transfer,
  TransferHandle,
  TransferItem,
  TransferList,
} from '#/shared/ui/sortable'

const names: Record<string, string> = { a: 'Альфа', b: 'Бета', c: 'Гамма', x: 'Глава 1', y: 'Глава 2' }
const moveLabel = (key: string) => `Переместить ${names[key]}`
const handle = (key: string) => <IconButton label={moveLabel(key)} icon={<GripVertical aria-hidden />} />
const shownRows = () => [...document.querySelectorAll('li')].map(li => li.textContent)
const announced = () => [...document.querySelectorAll('[data-ui-sdk-announcer]')].map(el => el.textContent).join(' ')

type Moved = { value: unknown; key: string }

function Ranked({ moved }: { moved: Moved[] }) {
  const [order, setOrder] = useState(['a', 'b', 'c'])
  return (
    <Sortable
      value={order}
      onValueChange={(value, { key }) => {
        moved.push({ value, key })
        setOrder(value)
      }}
      label={key => names[key]}
    >
      {shown => (
        <ol>
          {shown.map(key => (
            <SortableItem key={key} value={key}>
              <span>{names[key]}</span>
              <SortableHandle render={handle(key)} />
            </SortableItem>
          ))}
        </ol>
      )}
    </Sortable>
  )
}

test('a handle picks its row up, moves it as a draft, puts it back on Escape and drops it on Space', async () => {
  const moved: Moved[] = []
  const screen = await renderInRouter(<Ranked moved={moved} />)
  const beta = screen.getByRole('button', { name: moveLabel('b') })
  await expect.element(beta).toBeVisible()
  beta.element().focus()
  await userEvent.keyboard(' ')
  await expect.element(beta).toHaveAttribute('aria-pressed', 'true')
  const place = m.ui_drag_place({ position: 2, total: 3 })
  await expect.poll(announced).toContain(m.ui_drag_picked({ name: 'Бета', place }))
  await userEvent.keyboard('{ArrowUp}')
  await expect.poll(shownRows).toEqual(['Бета', 'Альфа', 'Гамма'])
  expect(beta.element()).toBe(document.activeElement)
  await userEvent.keyboard('{Escape}')
  await expect.poll(shownRows).toEqual(['Альфа', 'Бета', 'Гамма'])
  await expect.element(beta).toHaveAttribute('aria-pressed', 'false')
  expect(moved).toEqual([])

  await userEvent.keyboard(' ')
  await userEvent.keyboard('{End}')
  await userEvent.keyboard(' ')
  await expect.poll(shownRows).toEqual(['Альфа', 'Гамма', 'Бета'])
  expect(moved).toEqual([{ value: ['a', 'c', 'b'], key: 'b' }])
  await expect.element(beta).toHaveAttribute('aria-pressed', 'false')
  expect(beta.element()).toBe(document.activeElement)
  await expect.poll(announced).toContain(m.ui_drag_place({ position: 3, total: 3 }))
})

test('a handle points to the instructions, in the interface language', async () => {
  const screen = await renderInRouter(<Ranked moved={[]} />)
  const locator = screen.getByRole('button', { name: moveLabel('a') })
  await expect.element(locator).toBeVisible()
  const button = locator.element()
  const help = document.getElementById(button.getAttribute('aria-describedby')?.split(' ')[0] ?? '')
  expect(help?.textContent).toBe(m.ui_drag_instructions())
  expect(help?.hidden).toBe(true)
  expect(button.getAttribute('aria-roledescription')).toBe(m.ui_drag_role())
})

function Chapters({ moved }: { moved: Moved[] }) {
  const [lists, setLists] = useState<Record<string, string[]>>({ x: ['a', 'b'], y: [] })
  return (
    <Transfer
      value={lists}
      onValueChange={(value, { key }) => {
        moved.push({ value, key })
        setLists(value)
      }}
      label={key => names[key]}
      listLabel={key => names[key]}
    >
      {shown =>
        Object.entries(shown).map(([list, rows]) => (
          <section key={list} aria-label={names[list]}>
            <TransferList value={list} className="min-h-8">
              {rows.map(key => (
                <TransferItem key={key} value={key}>
                  <span>{names[key]}</span>
                  <TransferHandle render={handle(key)} />
                </TransferItem>
              ))}
            </TransferList>
          </section>
        ))
      }
    </Transfer>
  )
}

test('Down past the last row of a list takes the row into the list below, an empty one too', async () => {
  const moved: Moved[] = []
  const screen = await renderInRouter(<Chapters moved={moved} />)
  const beta = screen.getByRole('button', { name: moveLabel('b') })
  await expect.element(beta).toBeVisible()
  beta.element().focus()
  await userEvent.keyboard(' ')
  await userEvent.keyboard('{ArrowDown}')
  await expect.element(screen.getByRole('region', { name: 'Глава 2' }).getByText('Бета')).toBeVisible()
  const place = m.ui_drag_place_in({ list: 'Глава 2', position: 1, total: 1 })
  await expect.poll(announced).toContain(m.ui_drag_moved({ name: 'Бета', place }))
  await userEvent.keyboard('{ArrowUp}')
  await expect.element(screen.getByRole('region', { name: 'Глава 1' }).getByText('Бета')).toBeVisible()
  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard(' ')
  expect(moved).toEqual([{ value: { x: ['a'], y: ['b'] }, key: 'b' }])
  await expect.element(screen.getByRole('button', { name: moveLabel('b') })).toHaveAttribute('aria-pressed', 'false')
})
