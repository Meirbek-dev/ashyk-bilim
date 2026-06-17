/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { FieldError } from '../../components/ui/field'

// Mock next-intl
const mockT = vi.fn((key: string) => {
  const translations: Record<string, string> = {
    titleRequired: 'Title is required',
    descriptionRequired: 'Description is required',
    titleTooLong: 'Title must not exceed 100 characters',
  }
  return translations[key] || key
})

const mockHas = vi.fn((key: string) => {
  const keys = ['titleRequired', 'descriptionRequired', 'titleTooLong']
  return keys.includes(key)
})

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const tFunc = (key: string) => mockT(key)
    tFunc.has = (key: string) => mockHas(key)
    return tFunc
  },
}))

describe('FieldError', () => {
  it('renders raw error message if no translation key matches', () => {
    render(<FieldError errors={[{ message: 'some_unknown_error' }]} />)
    expect(screen.getByRole('alert')).toHaveTextContent('some_unknown_error')
  })

  it('translates snake_case error messages to camelCase', () => {
    render(<FieldError errors={[{ message: 'title_required' }]} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
  })

  it('translates camelCase error messages directly', () => {
    render(<FieldError errors={[{ message: 'titleRequired' }]} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
  })

  it('renders multiple unique error messages', () => {
    render(
      <FieldError
        errors={[
          { message: 'title_required' },
          { message: 'title_too_long' },
          { message: 'title_required' }, // duplicate should be filtered
        ]}
      />,
    )
    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(2)
    expect(listItems[0]).toHaveTextContent('Title is required')
    expect(listItems[1]).toHaveTextContent('Title must not exceed 100 characters')
  })
})
