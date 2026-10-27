import { page } from 'vite-plus/test/browser'
import { describe, expect, test, vi } from 'vite-plus/test'

import { Button } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'

import type { DataColumn, Sort } from './data-columns'
import { DataTable } from './data-table'
import { renderInRouter } from './testing'

type Row = { id: string; name: string; learners: number }
const rows: Row[] = [
  { id: 'a', name: 'Algebra', learners: 12 },
  { id: 'b', name: 'Biology', learners: 3 },
]
const columns: DataColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: row => row.name, priority: 1, sortable: true },
  { id: 'learners', header: 'Learners', cell: row => row.learners, priority: 2 },
  { id: 'code', header: 'Code', cell: row => row.id, priority: 3 },
]
const label = 'Courses'

describe('DataTable', () => {
  test('wide: a table whose sortable header writes the next sort and shows the current one', async () => {
    await page.viewport(1280, 800)
    const onSortChange = vi.fn<(sort: Sort | undefined) => void>()
    const screen = await renderInRouter(
      <DataTable
        label={label}
        rows={rows}
        columns={columns}
        getKey={row => row.id}
        sort={{ id: 'name', desc: false }}
        onSortChange={onSortChange}
      />,
    )
    await expect.element(screen.getByRole('table', { name: label })).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending')
    await expect.element(screen.getByRole('cell', { name: 'b' })).toBeVisible()
    await screen.getByRole('button', { name: 'Name' }).click()
    expect(onSortChange).toHaveBeenCalledWith({ id: 'name', desc: true })
  })

  test('narrow: cards with the priority 1 title and priority 2 lines, no table', async () => {
    await page.viewport(390, 800)
    const screen = await renderInRouter(
      <DataTable label={label} rows={rows} columns={columns} getKey={row => row.id} />,
    )
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
    const cards = screen.getByRole('listitem')
    await expect.poll(() => cards.elements().length).toBe(2)
    await expect.element(cards.first().getByRole('heading', { name: 'Algebra' })).toBeVisible()
    await expect.element(cards.first().getByRole('definition')).toHaveTextContent('12')
    await expect.element(cards.first()).not.toHaveTextContent('Code')
  })

  test('narrow: a second priority 1 column is a line under the title, the action column has no label', async () => {
    await page.viewport(390, 800)
    const queue: DataColumn<Row>[] = [
      { id: 'name', header: 'Activity', cell: row => row.name, priority: 1 },
      { id: 'who', header: 'Learner', cell: row => `learner ${row.id}`, priority: 1 },
      {
        id: 'act',
        header: 'Action',
        cell: row => <Button aria-label={`Open ${row.id}`} />,
        priority: 2,
        action: true,
      },
    ]
    const screen = await renderInRouter(<DataTable label={label} rows={rows} columns={queue} getKey={row => row.id} />)
    const card = screen.getByRole('listitem').first()
    await expect.element(card.getByRole('heading', { name: 'Algebra' })).toBeVisible()
    await expect.element(card.getByText('learner a')).toBeVisible()
    await expect.element(card.getByRole('button', { name: 'Open a' })).toBeVisible()
    await expect.element(card).not.toHaveTextContent('Action')
    await expect.element(card).not.toHaveTextContent('Learner')
  })

  test('narrow: the selection column sits before the card title, without its label', async () => {
    await page.viewport(390, 800)
    const picked: DataColumn<Row>[] = [
      {
        id: 'pick',
        header: 'Select',
        cell: row => <Checkbox aria-label={`Pick ${row.name}`} />,
        priority: 2,
        select: true,
      },
      { id: 'name', header: 'Name', cell: row => row.name, priority: 1 },
    ]
    const screen = await renderInRouter(<DataTable label={label} rows={rows} columns={picked} getKey={row => row.id} />)
    const card = screen.getByRole('listitem').first()
    await expect.element(card.getByRole('checkbox', { name: 'Pick Algebra' })).toBeVisible()
    await expect.element(card.getByRole('heading', { name: 'Algebra' })).toBeVisible()
    await expect.element(card).not.toHaveTextContent('Select')
  })
})

const pickAll = 'Pick all'

describe('DataTable header cell', () => {
  test('wide: a header cell (select all) takes the column header in the table', async () => {
    await page.viewport(1280, 800)
    const picked: DataColumn<Row>[] = [
      {
        id: 'pick',
        header: 'Select',
        headerCell: <Checkbox aria-label={pickAll} />,
        cell: row => <Checkbox aria-label={`Pick ${row.name}`} />,
        priority: 2,
        select: true,
      },
      { id: 'name', header: 'Name', cell: row => row.name, priority: 1 },
    ]
    const screen = await renderInRouter(<DataTable label={label} rows={rows} columns={picked} getKey={row => row.id} />)
    const header = screen.getByRole('columnheader').first()
    await expect.element(header.getByRole('checkbox', { name: pickAll })).toBeVisible()
    await expect.element(header).not.toHaveTextContent('Select')
  })
})

describe('DataTable footer', () => {
  test('wide: a footer row sums up each column under the rows', async () => {
    await page.viewport(1280, 800)
    const screen = await renderInRouter(
      <DataTable
        label={label}
        rows={rows}
        columns={columns}
        getKey={row => row.id}
        footer={column => (column.id === 'learners' ? 'Σ 15' : column.id === 'name' ? 'Total' : null)}
      />,
    )
    const footer = screen.getByRole('row').last()
    await expect.element(footer.getByRole('cell', { name: 'Total' })).toBeVisible()
    await expect.element(footer.getByRole('cell', { name: 'Σ 15' })).toBeVisible()
  })
})

describe('DataTable cards', () => {
  test('narrow: the value of a line with a long label starts at the left under it, not at the far right', async () => {
    await page.viewport(390, 800)
    const long = 'Демонстрация онлайн компилятора платформы и ещё несколько слов'
    const wide: DataColumn<Row>[] = [
      ...columns.slice(0, 1),
      { id: 'learners', header: long, cell: row => row.learners, priority: 2 },
    ]
    const screen = await renderInRouter(<DataTable label={label} rows={rows} columns={wide} getKey={row => row.id} />)
    const value = screen.getByRole('listitem').first().getByRole('definition')
    await expect.element(value).toBeVisible()
    const term = screen.getByRole('listitem').first().getByRole('term').element().getBoundingClientRect()
    expect(Math.abs(value.element().getBoundingClientRect().left - term.left)).toBeLessThan(2)
  })
})

describe('DataTable cards', () => {
  test('narrow: a line whose cell is empty leaves its label out, not a bare «Description»', async () => {
    await page.viewport(390, 800)
    const described: DataColumn<Row>[] = [
      ...columns,
      { id: 'note', header: 'Description', cell: row => (row.id === 'a' ? 'Core course' : null), priority: 2 },
    ]
    const screen = await renderInRouter(
      <DataTable label={label} rows={rows} columns={described} getKey={row => row.id} />,
    )
    const cards = screen.getByRole('listitem')
    await expect.element(cards.first().getByText('Description')).toBeVisible()
    await expect.element(cards.nth(1).getByText('Description')).not.toBeInTheDocument()
  })
})
