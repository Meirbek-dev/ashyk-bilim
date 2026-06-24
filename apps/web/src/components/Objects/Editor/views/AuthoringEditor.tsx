'use client'

import { ActivityAIChatProvider } from '@components/Contexts/AI/ActivityAIChatContext'
import { CourseProvider } from '@components/Contexts/CourseContext'
import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext'
import { Tiptap } from '@tiptap/react'
import { useEditorInstance } from '@components/Objects/Editor/core'
import type { ActivityRef } from '@components/Objects/Editor/core/editor-types'
import { EditorToolbar } from '../Toolbar/EditorToolbar'
import { BubbleToolbar } from '../menus/BubbleToolbar'
import { FloatingPlusButton } from '../menus/FloatingPlusButton'
import { SlashCommandMenu } from '../Toolbar/SlashCommandMenu'
import AIEditorToolkit from '../AI/AIEditorToolkit'
import { EditorHeader, EditorShell } from '../chrome'
import DesktopOnlyGuard from '@components/Dashboard/Misc/DesktopOnlyGuard'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEmbedPanelStore } from '../Toolbar/EmbedPanel/EmbedPanelStore'
import { EmbedPanel } from '../Toolbar/EmbedPanel/EmbedPanel'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

import '@components/Objects/Editor/styles/prosemirror.css'

// ── EditorCore ────────────────────────────────────────────────────────────────
// Owns the editor instance and the <Tiptap> tree. Does NOT receive saveState
// or isAIOpen as props so that changes to those values in the parent do not
// cause EditorCore to re-render (Requirement 2.1).

interface EditorCoreProps {
  activity: ActivityRef
  content: unknown
  onUpdate: (json: object) => void
  onAIToggle: () => void
}

function EditorCore({ activity, content, onUpdate, onAIToggle }: EditorCoreProps) {
  const closeEmbedPanel = useEmbedPanelStore(s => s.close)

  // isAIOpen is managed inside EditorCore so that toggling it does not cause
  // the parent (AuthoringEditor) to re-render the editor subtree (Requirement 2.1).
  const [isAIOpen, setIsAIOpen] = useState(false)
  const handleAIToggle = useCallback(() => {
    setIsAIOpen(prev => !prev)
    onAIToggle()
  }, [onAIToggle])
  const handleAIClose = useCallback(() => setIsAIOpen(false), [])

  // Close the embed panel when EditorCore unmounts (Requirement 2.1 / design cleanup).
  useEffect(() => {
    return () => {
      closeEmbedPanel()
    }
  }, [closeEmbedPanel])

  // Wrap onUpdate with queueMicrotask to avoid the React flushSync warning
  // (Requirement 2.3). The callback ref pattern keeps the identity stable so
  // useEditorInstance's deps array never changes.
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  })
  const stableOnUpdate = useCallback((json: object) => {
    queueMicrotask(() => onUpdateRef.current(json))
  }, [])

  const editor = useEditorInstance({
    preset: 'authoring',
    activity,
    content,
    onUpdate: stableOnUpdate,
  })

  // Render a loading placeholder while the editor is null (Requirement 1.2).
  // Matches the dimensions of the content area so there is no layout shift.
  if (!editor) {
    return (
      <div className="prosemirror-authoring bg-background flex-1 overflow-y-auto">
        <div className="py-6">
          <div className="bg-muted/40 mx-auto min-h-[500px] w-full max-w-3xl animate-pulse rounded-md" />
        </div>
      </div>
    )
  }

  return (
    // Wrap the entire editor tree in <Tiptap> so all child components can
    // access the editor via useTiptap() / useTiptapState() (Requirement 1.1).
    <Tiptap instance={editor}>
      {/* Sticky toolbar */}
      <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="px-3">
          <EditorToolbar onAIToggle={handleAIToggle} />
        </div>
      </div>

      {/* Content area */}
      <div className="prosemirror-authoring bg-background flex-1 overflow-y-auto">
        <div className="py-6">
          {/* BubbleMenu wraps BubbleToolbar. BubbleToolbar reads the editor via
              useTiptap() internally (Requirement 1.5). BubbleMenu's editor prop
              is optional when inside a <Tiptap> context. */}
          <BubbleMenu
            shouldShow={() => {
              if (editor.state.selection.empty) return false
              if (editor.isActive('image')) return false
              return true
            }}
            className="border-border bg-popover flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-md"
          >
            <BubbleToolbar />
          </BubbleMenu>
          {/* FloatingPlusButton and SlashCommandMenu read the editor via
              useTiptap() (Requirement 1.5). */}
          <FloatingPlusButton />
          <SlashCommandMenu />
          {/* Tiptap.Content replaces <EditorContent editor={editor} /> (Requirement 1.3) */}
          <Tiptap.Content />
        </div>
      </div>

      {/* AIEditorToolkit is inside the <Tiptap> tree so it can access the editor
          via useTiptap() (Requirement 1.5). isAIOpen is managed in EditorCore
          so parent state changes don't re-render this subtree (Requirement 2.1). */}
      <AIEditorToolkit activity={activity} isOpen={isAIOpen} onClose={handleAIClose} />

      {/* EmbedPanel is inside the <Tiptap> tree so it can access the editor via
          useTiptap(). It reads open state from EmbedPanelStore and has no props.
          It renders as a fixed-position modal overlay, so placement here does
          not affect visual layout (Requirements 3.2, 3.4). */}
      <EmbedPanel />
    </Tiptap>
  )
}

// ── AuthoringEditor ───────────────────────────────────────────────────────────

interface AuthoringEditorProps {
  content: unknown
  activity: ActivityRef
  course: {
    course_uuid: string
    name: string
    thumbnail_image?: string | null
  }
  platform: unknown
  onContentChange: (content: unknown) => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  setContent: (content: unknown) => void
}

export function AuthoringEditor(props: AuthoringEditorProps) {
  const t = useTranslations('DashPage.Editor.Editor')
  const latestContentRef = useRef(props.content)

  const courseUuid = props.course.course_uuid.slice(7)
  const activityUuid = props.activity.activity_uuid.slice(9)

  useEffect(() => {
    latestContentRef.current = props.content
  }, [props.content])

  // onAIToggle is a stable no-op passed to EditorCore. EditorCore manages its
  // own isAIOpen state internally so that toggling the AI panel does not cause
  // AuthoringEditor to re-render the editor subtree (Requirement 2.1).
  const onAIToggle = useCallback(() => {}, [])

  const onContentChange = useEffectEvent(props.onContentChange)

  const handleContentChange = useCallback((content: unknown) => {
    latestContentRef.current = content
    onContentChange(content)
  }, [onContentChange])

  function handleContentSave() {
    props.setContent(latestContentRef.current)
  }

  return (
    <DesktopOnlyGuard title={t('mobileTitle')} description={t('mobileMessage1')} supportingText={t('mobileMessage2')}>
      <CourseProvider courseuuid={props.course.course_uuid}>
        <ActivityAIChatProvider activityUuid={props.activity.activity_uuid}>
          <EditorOptionsProvider options={{ isEditable: true, mode: 'authoring' }}>
            <EditorShell>
              {/* Header — receives saveState from parent; does not affect EditorCore */}
              <EditorHeader
                courseName={props.course.name}
                activityName={props.activity.name ?? ''}
                courseUuid={courseUuid}
                activityUuid={activityUuid}
                saveState={props.saveState}
                onSave={handleContentSave}
              />

              {/* EditorCore owns the editor instance and <Tiptap> tree.
                  It does NOT receive saveState or isAIOpen (Requirement 2.1). */}
              <EditorCore
                activity={props.activity}
                content={props.content}
                onUpdate={handleContentChange}
                onAIToggle={onAIToggle}
              />
            </EditorShell>
          </EditorOptionsProvider>
        </ActivityAIChatProvider>
      </CourseProvider>
    </DesktopOnlyGuard>
  )
}
