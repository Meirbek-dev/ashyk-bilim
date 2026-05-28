/**
 * Accessibility tests for EditorToolbar and EmbedPanel.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

/** @vitest-environment jsdom */

import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock next-intl — return the key as the translation value
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock next/image — render a plain <img>
vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string; [k: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === 'string' ? src : ''} alt={alt} {...rest} />
  ),
}))

// Mock SVG imports used by EditorToolbar
vi.mock('@public/app_logo.svg', () => ({ default: '/app_logo.svg' }))
vi.mock('@public/app_logo_light.svg', () => ({ default: '/app_logo_light.svg' }))

// Mock theme provider
vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

// Mock @tiptap/react — provide minimal useTiptap / useTiptapState stubs
vi.mock('@tiptap/react', () => ({
  useTiptap: () => ({
    editor: {
      isActive: () => false,
      can: () => ({ undo: () => false, redo: () => false }),
      getAttributes: () => ({}),
      commands: {
        undo: vi.fn(),
        redo: vi.fn(),
        toggleBold: vi.fn(),
        toggleItalic: vi.fn(),
        toggleStrike: vi.fn(),
        toggleBulletList: vi.fn(),
        toggleOrderedList: vi.fn(),
        toggleCodeBlock: vi.fn(),
        toggleLink: vi.fn(),
        setHeading: vi.fn(),
        insertEmbedBlock: vi.fn(),
        updateEmbedBlock: vi.fn(),
      },
      chain: () => ({ focus: () => ({ run: vi.fn() }) }),
    },
  }),
  useTiptapState: (selector: (snap: unknown) => unknown) =>
    selector({
      editor: {
        isActive: () => false,
        can: () => ({ undo: () => false, redo: () => false }),
        getAttributes: () => ({}),
      },
    }),
}))

// Mock sub-components used by EditorToolbar that have their own heavy deps
vi.mock('../../components/Objects/Editor/Toolbar/UndoRedoGroup', () => ({
  UndoRedoGroup: () => <div data-testid="undo-redo-group" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/TextFormatGroup', () => ({
  TextFormatGroup: () => <div data-testid="text-format-group" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/HeadingDropdown', () => ({
  HeadingDropdown: () => <div data-testid="heading-dropdown" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/CodeBlockLanguageDropdown', () => ({
  CodeBlockLanguageDropdown: () => <div data-testid="code-block-language-dropdown" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/LinkToggle', () => ({
  LinkToggle: () => <div data-testid="link-toggle" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/ListDropdown', () => ({
  ListDropdown: () => <div data-testid="list-dropdown" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/TableDropdown', () => ({
  TableDropdown: () => <div data-testid="table-dropdown" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/InsertButtons', () => ({
  InsertButtons: () => <div data-testid="insert-buttons" />,
}))

// Mock EmbedPanel sub-components to keep tests focused on accessibility
vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/EmbedTypeSelector', () => ({
  EmbedTypeSelector: ({
    onSelect,
  }: {
    selectedType: string | null
    onSelect: (t: string) => void
    error: string | null
  }) => (
    <div data-testid="embed-type-selector">
      <button type="button" onClick={() => onSelect('youtube')}>
        Select YouTube
      </button>
    </div>
  ),
}))
vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/YouTubeEmbedForm', () => ({
  YouTubeEmbedForm: () => <div data-testid="youtube-embed-form" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/ExcalidrawEmbedForm', () => ({
  ExcalidrawEmbedForm: () => <div data-testid="excalidraw-embed-form" />,
}))
vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/TldrawEmbedForm', () => ({
  TldrawEmbedForm: () => <div data-testid="tldraw-embed-form" />,
}))

// Mock embed validators
vi.mock('../../components/Objects/Editor/Extensions/EmbedBlock/embed-validators', () => ({
  parseYouTubeUrl: (url: string) => (url.includes('youtube') ? 'dQw4w9WgXcQ' : null),
  validateEmbedUrl: (_type: string, url: string) =>
    url.trim() === '' ? 'errorEmpty' : url.includes('invalid') ? 'errorInvalid' : null,
  normalizeEmbedUrl: (_type: string, url: string) => url.trim(),
  validateExcalidrawUrl: (url: string) =>
    url.trim() === '' ? 'errorEmpty' : url.includes('excalidraw.com') ? null : 'errorInvalid',
  validateTldrawUrl: (url: string) =>
    url.trim() === '' ? 'errorEmpty' : url.includes('tldraw.com') ? null : 'errorInvalid',
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { EditorToolbar } from '../../components/Objects/Editor/Toolbar/EditorToolbar'
import { EmbedPanel } from '../../components/Objects/Editor/Toolbar/EmbedPanel/EmbedPanel'
import { useEmbedPanelStore } from '../../components/Objects/Editor/Toolbar/EmbedPanel/EmbedPanelStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset the Zustand store to its initial state before each test. */
function resetEmbedPanelStore() {
  useEmbedPanelStore.setState({
    isOpen: false,
    mode: 'insert',
    nodePos: null,
    initialType: null,
    initialUrl: '',
    triggerRef: null,
  })
}

/** Open the panel by setting store state inside act(). */
function openPanel() {
  act(() => {
    useEmbedPanelStore.setState({ isOpen: true, mode: 'insert' })
  })
}

// ── EditorToolbar accessibility tests ────────────────────────────────────────

describe('EditorToolbar accessibility (Requirement 12.1)', () => {
  beforeEach(() => {
    resetEmbedPanelStore()
  })

  it('renders a toolbar element with role="toolbar"', () => {
    render(<EditorToolbar onAIToggle={vi.fn()} />)
    const toolbar = screen.getByRole('toolbar')
    expect(toolbar).toBeInTheDocument()
  })

  it('has a non-empty aria-label on the toolbar element', () => {
    render(<EditorToolbar onAIToggle={vi.fn()} />)
    const toolbar = screen.getByRole('toolbar')
    const label = toolbar.getAttribute('aria-label')
    expect(label).toBeTruthy()
    expect(label!.trim().length).toBeGreaterThan(0)
  })
})

// ── EmbedPanel accessibility tests ───────────────────────────────────────────

describe('EmbedPanel ARIA attributes (Requirements 12.2)', () => {
  beforeEach(() => {
    resetEmbedPanelStore()
  })

  it('renders a dialog element with role="dialog" when open', () => {
    render(<EmbedPanel />)
    openPanel()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('has aria-modal="true" on the dialog element', () => {
    render(<EmbedPanel />)
    openPanel()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('has aria-labelledby pointing to the visible title element', () => {
    render(<EmbedPanel />)
    openPanel()
    const dialog = screen.getByRole('dialog')
    const labelledById = dialog.getAttribute('aria-labelledby')
    expect(labelledById).toBeTruthy()

    // The referenced element must exist in the DOM and contain visible text
    const titleEl = document.getElementById(labelledById!)
    expect(titleEl).not.toBeNull()
    expect(titleEl!.textContent?.trim().length).toBeGreaterThan(0)
  })

  it('does not render the dialog when the store is closed', () => {
    render(<EmbedPanel />)
    // Store is closed by default (resetEmbedPanelStore)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('EmbedPanel focus management (Requirements 12.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetEmbedPanelStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves focus to the first focusable element within 100ms of opening', () => {
    render(<EmbedPanel />)
    openPanel()

    // Advance timers past the 100ms focus delay
    act(() => {
      vi.advanceTimersByTime(150)
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})

describe('EmbedPanel focus trap (Requirements 12.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetEmbedPanelStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Tab key cycles focus within the dialog', async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    })
    render(<EmbedPanel />)
    openPanel()

    // Advance timers to trigger focus management
    act(() => {
      vi.advanceTimersByTime(150)
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)

    // Tab through all focusable elements — focus must stay inside the dialog
    for (let i = 0; i < 5; i += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('Shift+Tab key cycles focus backwards within the dialog', async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    })
    render(<EmbedPanel />)
    openPanel()

    // Advance timers to trigger focus management
    act(() => {
      vi.advanceTimersByTime(150)
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)

    // Shift+Tab through all focusable elements — focus must stay inside the dialog
    for (let i = 0; i < 5; i += 1) {
      await user.tab({ shift: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})

describe('EmbedPanel Escape key behavior (Requirements 12.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    resetEmbedPanelStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Escape key closes the dialog', async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    })
    render(<EmbedPanel />)
    openPanel()

    // Advance timers to move focus inside the dialog
    act(() => {
      vi.advanceTimersByTime(150)
    })

    // Verify dialog is open and focus is inside
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape key returns focus to the trigger element', async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    })

    // Create a trigger button and set it as the triggerRef in the store
    const triggerButton = document.createElement('button')
    triggerButton.textContent = 'Open Embed'
    document.body.appendChild(triggerButton)

    const triggerRef = { current: triggerButton }

    act(() => {
      useEmbedPanelStore.setState({
        isOpen: true,
        mode: 'insert',
        triggerRef,
      })
    })

    render(<EmbedPanel />)

    // Advance timers to move focus inside the dialog
    act(() => {
      vi.advanceTimersByTime(150)
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')

    // Advance timers for the focus-return setTimeout(0)
    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(document.activeElement).toBe(triggerButton)

    // Cleanup
    document.body.removeChild(triggerButton)
  })
})
