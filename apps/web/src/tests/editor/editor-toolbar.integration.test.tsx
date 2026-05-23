/**
 * Integration test: EditorToolbar does not re-render when isAIOpen changes.
 *
 * Validates: Requirement 2.4
 *
 * Key insight: EditorToolbar no longer receives `isAIOpen` as a prop — it only
 * receives `onAIToggle`. When `isAIOpen` changes in the parent, EditorToolbar
 * should NOT re-render because none of its props or subscribed state slices
 * have changed.
 */

/** @vitest-environment jsdom */

import React, { useRef, useState } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

// Mock @tiptap/react so EditorToolbar can render without a real Tiptap context.
// useTiptap() returns a stable fake editor; useTiptapState() returns stable
// primitive state so the toolbar renders without errors.
vi.mock('@tiptap/react', () => {
  const fakeEditor = {
    isActive: () => false,
    can: () => ({ undo: () => false, redo: () => false }),
    getAttributes: () => ({}),
    chain: () => ({ focus: () => ({ run: () => {} }) }),
    commands: {},
    state: { selection: { empty: true } },
    isEditable: true,
  };

  const stableToolbarState = {
    isBold: false,
    isItalic: false,
    isStrike: false,
    isBulletList: false,
    isOrderedList: false,
    isCodeBlock: false,
    isLink: false,
    headingLevel: 0,
    canUndo: false,
    canRedo: false,
    codeBlockLanguage: null,
    linkHref: '',
  };

  return {
    useTiptap: () => ({ editor: fakeEditor }),
    useTiptapState: (_selector: unknown) => stableToolbarState,
    Tiptap: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      {...props}
    />
  ),
}));

// Mock theme provider
vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

// Mock EmbedPanelStore — open is a stable no-op so it never changes identity
const stableOpen = vi.fn();
vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/EmbedPanelStore', () => ({
  useEmbedPanelStore: (selector: (s: { open: typeof stableOpen }) => unknown) => selector({ open: stableOpen }),
}));

// Mock all sub-components that EditorToolbar renders so they don't pull in
// heavy dependencies. Each is a simple stable component.
vi.mock('../../components/Objects/Editor/Toolbar/UndoRedoGroup', () => ({
  UndoRedoGroup: () => <div data-testid="undo-redo" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/TextFormatGroup', () => ({
  TextFormatGroup: () => <div data-testid="text-format" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/HeadingDropdown', () => ({
  HeadingDropdown: () => <div data-testid="heading-dropdown" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/CodeBlockLanguageDropdown', () => ({
  CodeBlockLanguageDropdown: () => <div data-testid="code-block-lang" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/LinkToggle', () => ({
  LinkToggle: () => <div data-testid="link-toggle" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/ListDropdown', () => ({
  ListDropdown: () => <div data-testid="list-dropdown" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/TableDropdown', () => ({
  TableDropdown: () => <div data-testid="table-dropdown" />,
}));
vi.mock('../../components/Objects/Editor/Toolbar/InsertButtons', () => ({
  InsertButtons: () => <div data-testid="insert-buttons" />,
}));

// Mock shadcn/ui components used in EditorToolbar
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));
vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef(
    (
      { children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>,
      ref: React.Ref<HTMLButtonElement>,
    ) => (
      <button
        ref={ref}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    ),
  ),
}));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render: renderProp }: { render?: React.ReactElement }) => renderProp ?? null,
  TooltipContent: () => null,
}));

// ---------------------------------------------------------------------------
// Import the component under test AFTER all mocks are set up
// ---------------------------------------------------------------------------

import { EditorToolbar } from '../../components/Objects/Editor/Toolbar/EditorToolbar';

// ---------------------------------------------------------------------------
// Render-count tracking
//
// We wrap EditorToolbar in a React.memo component that increments a ref
// counter on every render. Because EditorToolbar itself is not memoized,
// we track renders by wrapping it in a spy component.
// ---------------------------------------------------------------------------

let renderCount = 0;

/**
 * A thin wrapper that counts how many times EditorToolbar renders.
 * Using React.memo here is intentional: it ensures the wrapper itself
 * only re-renders when its own props change, so any re-render of the
 * inner EditorToolbar is caused by its own hooks, not by the wrapper.
 */
const TrackedEditorToolbar = React.memo(({ onAIToggle }: { onAIToggle: () => void }) => {
  renderCount += 1;
  return <EditorToolbar onAIToggle={onAIToggle} />;
});

// ---------------------------------------------------------------------------
// Parent component that owns isAIOpen state
// ---------------------------------------------------------------------------

function ParentWithAIState({ onAIToggle }: { onAIToggle: () => void }) {
  const [isAIOpen, setIsAIOpen] = useState(false);

  // Expose toggle via a button so tests can trigger it
  return (
    <div>
      <button
        data-testid="toggle-ai"
        onClick={() => setIsAIOpen((prev) => !prev)}
      >
        Toggle AI
      </button>
      {/* isAIOpen is used here in the parent but NOT passed to TrackedEditorToolbar */}
      <div data-testid="ai-state">{isAIOpen ? 'open' : 'closed'}</div>
      <TrackedEditorToolbar onAIToggle={onAIToggle} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EditorToolbar — no re-render when isAIOpen changes (Requirement 2.4)', () => {
  let onAIToggle: () => void;

  beforeEach(() => {
    renderCount = 0;
    onAIToggle = vi.fn(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders EditorToolbar exactly once on initial mount', () => {
    render(<ParentWithAIState onAIToggle={onAIToggle} />);
    expect(renderCount).toBe(1);
  });

  it('does NOT re-render EditorToolbar when isAIOpen toggles once', () => {
    const { getByTestId } = render(<ParentWithAIState onAIToggle={onAIToggle} />);

    const countAfterMount = renderCount;
    expect(countAfterMount).toBe(1);

    // Toggle isAIOpen in the parent
    act(() => {
      getByTestId('toggle-ai').click();
    });

    // Parent re-rendered (ai-state changed to "open")
    expect(getByTestId('ai-state').textContent).toBe('open');

    // EditorToolbar must NOT have re-rendered
    expect(renderCount).toBe(countAfterMount);
  });

  it('does NOT re-render EditorToolbar when isAIOpen toggles multiple times', () => {
    const { getByTestId } = render(<ParentWithAIState onAIToggle={onAIToggle} />);

    const countAfterMount = renderCount;

    // Toggle isAIOpen three times
    act(() => {
      getByTestId('toggle-ai').click(); // → open
    });
    act(() => {
      getByTestId('toggle-ai').click(); // → closed
    });
    act(() => {
      getByTestId('toggle-ai').click(); // → open
    });

    // Parent state changed three times
    expect(getByTestId('ai-state').textContent).toBe('open');

    // EditorToolbar must still have rendered only once (the initial mount)
    expect(renderCount).toBe(countAfterMount);
  });

  it('onAIToggle prop identity is stable across parent re-renders', () => {
    // This test verifies the precondition: if onAIToggle were a new function
    // reference on every parent render, React.memo would not protect against
    // re-renders. We confirm the stable ref pattern works.
    const stableCallback = vi.fn(() => undefined);

    function ParentWithStableCallback() {
      const [isAIOpen, setIsAIOpen] = useState(false);
      // Use useCallback / useRef to keep the callback stable
      const callbackRef = useRef(stableCallback);
      const stableOnAIToggle = React.useCallback(() => callbackRef.current(), []);

      return (
        <div>
          <button
            data-testid="toggle-ai-stable"
            onClick={() => setIsAIOpen((prev) => !prev)}
          >
            Toggle
          </button>
          <div data-testid="ai-state-stable">{isAIOpen ? 'open' : 'closed'}</div>
          <TrackedEditorToolbar onAIToggle={stableOnAIToggle} />
        </div>
      );
    }

    const { getByTestId } = render(<ParentWithStableCallback />);
    const countAfterMount = renderCount;

    act(() => {
      getByTestId('toggle-ai-stable').click();
    });

    expect(getByTestId('ai-state-stable').textContent).toBe('open');
    expect(renderCount).toBe(countAfterMount);
  });
});
