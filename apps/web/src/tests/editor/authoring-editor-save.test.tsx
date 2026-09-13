/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

const editorHarness = vi.hoisted(() => ({
  onUpdate: null as ((json: object) => void) | null,
}))

const emptyDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

const updatedDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Saved lecture content' }],
    },
  ],
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@components/Contexts/CourseContext', () => ({
  CourseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@components/Contexts/Editor/EditorContext', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@components/Dashboard/Misc/DesktopOnlyGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../components/Objects/Editor/core', () => ({
  useEditorInstance: (options: { onUpdate: (json: object) => void }) => {
    editorHarness.onUpdate = options.onUpdate
    return {
      state: { selection: { empty: true } },
      isActive: () => false,
    }
  },
}))

vi.mock('@tiptap/react', () => ({
  Tiptap: Object.assign(({ children }: { children: React.ReactNode }) => <>{children}</>, {
    Content: () => (
      <button type="button" data-testid="emit-update" onClick={() => editorHarness.onUpdate?.(updatedDocument)}>
        Emit update
      </button>
    ),
  }),
  BubbleMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../components/Objects/Editor/Toolbar/EditorToolbar', () => ({
  EditorToolbar: () => <div data-testid="toolbar" />,
}))

vi.mock('../../components/Objects/Editor/Toolbar/SlashCommandMenu', () => ({
  SlashCommandMenu: () => null,
}))

vi.mock('../../components/Objects/Editor/Extensions/WebPreview/WebPreviewInsertDialog', () => ({
  WebPreviewInsertDialog: () => null,
}))

vi.mock('../../components/Objects/Editor/menus/BubbleToolbar', () => ({
  BubbleToolbar: () => null,
}))

vi.mock('../../components/Objects/Editor/menus/FloatingPlusButton', () => ({
  FloatingPlusButton: () => null,
}))

vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/EmbedPanelStore', () => ({
  useEmbedPanelStore: (selector: (state: { close: () => void }) => unknown) => selector({ close: vi.fn() }),
}))

vi.mock('../../components/Objects/Editor/Toolbar/EmbedPanel/EmbedPanel', () => ({
  EmbedPanel: () => null,
}))

const headerProps = vi.hoisted(() => ({ courseUuid: '', activityUuid: '' }))

vi.mock('../../components/Objects/Editor/chrome', () => ({
  EditorShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EditorHeader: ({ onSave, courseUuid, activityUuid }: { onSave: () => void; courseUuid: string; activityUuid: string }) => {
    headerProps.courseUuid = courseUuid
    headerProps.activityUuid = activityUuid
    return (
      <button type="button" onClick={onSave}>
        save
      </button>
    )
  },
}))

import { AuthoringEditor } from '../../components/Objects/Editor/views/AuthoringEditor'

describe('AuthoringEditor save', () => {
  it('saves the latest editor JSON instead of the initial content prop', async () => {
    const setContent = vi.fn()
    const onContentChange = vi.fn()

    render(
      <AuthoringEditor
        content={emptyDocument}
        activity={{ activity_uuid: 'activity_123', name: 'Lecture' }}
        course={{ course_uuid: 'course_123', name: 'Course' }}
        platform={null}
        onContentChange={onContentChange}
        saveState="idle"
        setContent={setContent}
      />,
    )

    fireEvent.click(screen.getByTestId('emit-update'))

    await waitFor(() => {
      expect(onContentChange).toHaveBeenCalledWith(updatedDocument)
    })

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    expect(setContent).toHaveBeenCalledWith(updatedDocument)
    expect(setContent).not.toHaveBeenCalledWith(emptyDocument)
  })

  it('passes bare v2 ids to the header links (legacy prefixes stripped, bare ids untouched)', () => {
    const noop = vi.fn()
    const { unmount } = render(
      <AuthoringEditor
        content={emptyDocument}
        activity={{ activity_uuid: 'activity_123', name: 'Lecture' }}
        course={{ course_uuid: 'course_123', name: 'Course' }}
        platform={null}
        onContentChange={noop}
        saveState="idle"
        setContent={noop}
      />,
    )
    expect(headerProps).toEqual({ courseUuid: '123', activityUuid: '123' })
    unmount()

    // v2 ids carry no prefix — the old `slice(7)` / `slice(9)` mangled them
    render(
      <AuthoringEditor
        content={emptyDocument}
        activity={{ activity_uuid: '01a0925e-dbb9-7cbc-a36c-4e0f8b24c9f8', name: 'Lecture' }}
        course={{ course_uuid: '01a0925e-9659-75d4-b8c2-d29faefaf401', name: 'Course' }}
        platform={null}
        onContentChange={noop}
        saveState="idle"
        setContent={noop}
      />,
    )
    expect(headerProps).toEqual({
      courseUuid: '01a0925e-9659-75d4-b8c2-d29faefaf401',
      activityUuid: '01a0925e-dbb9-7cbc-a36c-4e0f8b24c9f8',
    })
  })
})
