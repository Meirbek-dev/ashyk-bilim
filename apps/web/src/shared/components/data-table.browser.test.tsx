import { page } from 'vite-plus/test/browser'
import { describe, expect, test, vi } from 'vite-plus/test'

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
})
