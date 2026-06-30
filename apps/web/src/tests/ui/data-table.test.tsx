/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import DataTable from '@/components/ui/data-table'
import type { DataTableColumnDef } from '@/components/ui/data-table'

interface PersonRow {
  id: number
  name: string
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    const translations: Record<string, string> = {
      searchPlaceholder: 'Search',
      emptyMessage: 'No rows',
      visibleRows: `${values?.count ?? 0} rows`,
      showingRows: `${values?.from ?? 0}-${values?.to ?? 0} of ${values?.total ?? 0}`,
      page: `Page ${values?.current ?? 0} of ${values?.total ?? 0}`,
      prev: 'Previous',
      next: 'Next',
      rowsPerPage: 'Rows per page',
      columns: 'Columns',
      exportCsv: 'Export CSV',
      exportStarted: 'Export started',
    }
    return translations[key] ?? key
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
})

const columns: DataTableColumnDef<PersonRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
]

describe('DataTable', () => {
  it('paginates client-side rows with the built-in controls', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    render(
      <DataTable
        columns={columns}
        data={[
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Grace' },
          { id: 3, name: 'Katherine' },
        ]}
        pageSize={2}
      />,
    )

    const table = screen.getByRole('table')

    expect(within(table).getByText('Ada')).toBeInTheDocument()
    expect(within(table).getByText('Grace')).toBeInTheDocument()
    expect(within(table).queryByText('Katherine')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => {
      expect(within(table).getByText('Katherine')).toBeInTheDocument()
      expect(within(table).queryByText('Ada')).not.toBeInTheDocument()
    })
    expect(consoleError.mock.calls.flat().join('\n')).not.toContain('Cannot update a component')
  })

  it('uses TanStack pagination callbacks directly for server-paginated tables', async () => {
    const onPaginationChange = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    render(
      <DataTable
        columns={columns}
        data={[
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Grace' },
        ]}
        pageSize={2}
        pageCount={3}
        totalRows={6}
        serverPaginated
        onPaginationChange={onPaginationChange}
      />,
    )

    expect(consoleError.mock.calls.flat().join('\n')).not.toContain('Cannot update a component')

    await user.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => {
      expect(onPaginationChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 2 })
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    })
    expect(consoleError.mock.calls.flat().join('\n')).not.toContain('Cannot update a component')
  })

  it('renders already-paginated server rows without local pagination controls', () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Grace' },
          { id: 3, name: 'Katherine' },
        ]}
        pageSize={1}
        serverPaginated
      />,
    )

    const table = screen.getByRole('table')

    expect(within(table).getByText('Ada')).toBeInTheDocument()
    expect(within(table).getByText('Grace')).toBeInTheDocument()
    expect(within(table).getByText('Katherine')).toBeInTheDocument()
    expect(screen.queryByText('Rows per page')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })
})
