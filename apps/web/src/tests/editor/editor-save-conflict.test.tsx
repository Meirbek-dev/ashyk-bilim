/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

import { EditorSaveIndicator } from '@/components/Objects/Editor/chrome/EditorSaveIndicator'

// UX-027: a 412 on the autosave surfaces as a conflict notice with a reload action.
describe('EditorSaveIndicator conflict', () => {
  it('shows the localized conflict notice and reloads on request', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...globalThis.location, reload })

    render(<EditorSaveIndicator saveState="conflict" />)

    expect(screen.getByRole('alert')).toHaveTextContent('conflict')
    fireEvent.click(screen.getByRole('button', { name: 'reload' }))
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
