'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { MarkdownContent } from '../renderer/MarkdownContent'
import type { MarkdownEditorPreset, MarkdownEditorSaveState } from '../presets/presets'
import { getMarkdownPreset } from '../presets/presets'
import { normalizeMarkdown, isMarkdownStructurallyEmpty } from '../utils/markdown-sanitize'
import type { MarkdownValidationIssue } from '../hooks/useMarkdownValidation'
import { validateMarkdownContent } from '../hooks/useMarkdownValidation'
import { buildEditorExtensions } from '../lib/tiptap-extensions'
import { EditorToolbar } from './EditorToolbar'
import { EditorStatusBar } from './EditorStatusBar'
import type { ViewMode } from './EditorToolbar'

interface MarkdownStorage {
  markdown?: {
    getMarkdown?: () => string
  }
}

interface MarkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  preset?: MarkdownEditorPreset
  disabled?: boolean
  placeholder?: string
  className?: string
  minHeight?: number
  maxHeight?: number
  autoFocus?: boolean
  saveState?: MarkdownEditorSaveState
  required?: boolean
  onValidationChange?: (issues: MarkdownValidationIssue[]) => void
  onModeChange?: (mode: ViewMode) => void
  onBlur?: () => void
}

export function MarkdownEditor({
  value,
  onChange,
  preset = 'questionPrompt',
  disabled = false,
  placeholder,
  className,
  minHeight,
  maxHeight,
  autoFocus = false,
  saveState = 'idle',
  required = false,
  onValidationChange,
  onModeChange,
  onBlur,
}: MarkdownEditorProps) {
  const config = getMarkdownPreset(preset)
  const [viewMode, setViewMode] = useState<ViewMode>('write')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const sourceValue = (value ?? '').replace(/\r\n?/g, '\n')
  const normalizedValue = normalizeMarkdown(sourceValue)
  // Ref to track whether current content change came from the editor itself
  const isInternalUpdateRef = useRef(false)

  const issues = useMemo(
    () =>
      validateMarkdownContent(
        normalizedValue,
        preset,
        required ? { required } : {},
      ),
    [normalizedValue, preset, required],
  )

  useEffect(() => {
    onValidationChange?.(issues)
  }, [issues, onValidationChange])

  const charCount = normalizedValue.length
  const wordCount = normalizedValue.trim() ? normalizedValue.trim().split(/\s+/).length : 0
  const effectiveMinHeight = minHeight ?? config.minHeight
  const effectiveMaxHeight = maxHeight ?? config.maxHeight

  // Stable extensions array — rebuilt only when preset changes
  const extensions = useMemo(
    () => buildEditorExtensions(placeholder ? { config, placeholder } : { config }),
    [config, placeholder],
  )

  const editor = useEditor({
    extensions,
    content: normalizedValue,
    editable: !disabled,
    autofocus: autoFocus,
    immediatelyRender: false,
    ...(onBlur
      ? {
          onBlur: () => {
            onBlur()
          },
        }
      : {}),
    onUpdate: ({ editor: activeEditor }) => {
      const markdown = (activeEditor.storage as MarkdownStorage).markdown?.getMarkdown?.()
      if (markdown === undefined) return
      isInternalUpdateRef.current = true
      onChange(normalizeMarkdown(markdown))
    },
    editorProps: {
      attributes: {
        class: cn('outline-none px-4 py-3 focus:outline-none'),
        'aria-label': `${config.label} editor`,
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
  })

  // Sync external value changes into the editor, but skip updates the editor itself emitted
  useEffect(() => {
    if (!editor) return
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false
      return
    }
    const current = normalizeMarkdown(
      (editor.storage as MarkdownStorage).markdown?.getMarkdown?.() ?? '',
    )
    if (current !== normalizedValue) {
      // emitUpdate: false prevents triggering onUpdate, which would re-normalize and loop
      editor.commands.setContent(normalizedValue, { emitUpdate: false })
    }
  }, [editor, normalizedValue])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  // Fullscreen keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        setIsFullscreen(v => !v)
      }
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [isFullscreen])

  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen(v => !v)
  }, [])

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode)
      onModeChange?.(mode)
    },
    [onModeChange],
  )

  const handleSourceChange = useCallback(
    (nextValue: string) => {
      onChange(nextValue.replace(/\r\n?/g, '\n'))
    },
    [onChange],
  )

  const severity = issues.some(i => i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
      ? 'warning'
      : null

  const editorPanel = (
    <div
      className={cn(
        'bg-card overflow-hidden rounded-md border shadow-sm transition-colors',
        'focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-0',
        disabled && 'opacity-70',
        severity === 'error' && 'border-destructive/70',
        severity === 'warning' && 'border-amber-500/70',
        isFullscreen && 'fixed inset-4 z-50 flex flex-col',
        !isFullscreen && className,
      )}
    >
      {/* Toolbar */}
      <EditorToolbar
        editor={editor}
        config={config}
        disabled={disabled}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isFullscreen={isFullscreen}
        onFullscreenToggle={handleFullscreenToggle}
      />

      {/* Content area */}
      <div
        className={cn(
          'grid min-h-0',
          viewMode === 'split' && 'md:grid-cols-2',
          (viewMode === 'preview' || viewMode === 'source') && 'grid-cols-1',
          isFullscreen && 'flex-1 overflow-hidden',
        )}
        style={
          !isFullscreen
            ? { minHeight: effectiveMinHeight, maxHeight: effectiveMaxHeight }
            : undefined
        }
      >
        {viewMode === 'source' && (
          <textarea
            value={sourceValue}
            disabled={disabled}
            onBlur={onBlur}
            onChange={event => handleSourceChange(event.target.value)}
            aria-label={`${config.label} Markdown source`}
            spellCheck={false}
            className={cn(
              'bg-background min-h-0 w-full resize-none overflow-y-auto px-4 py-3 font-mono text-sm leading-6 outline-none',
              'focus:outline-none disabled:pointer-events-none disabled:opacity-70',
              isFullscreen && 'h-full',
            )}
            style={
              !isFullscreen
                ? { minHeight: effectiveMinHeight, maxHeight: effectiveMaxHeight }
                : undefined
            }
          />
        )}
        {viewMode !== 'preview' && viewMode !== 'source' && (
          <EditorContent
            editor={editor}
            className={cn(
              'prose prose-sm dark:prose-invert min-h-0 max-w-none overflow-y-auto',
              '[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/60',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
              disabled && 'pointer-events-none',
              isFullscreen && 'h-full',
            )}
            style={
              !isFullscreen
                ? { minHeight: effectiveMinHeight, maxHeight: effectiveMaxHeight }
                : undefined
            }
          />
        )}
        {viewMode !== 'write' && (
          <div
            className={cn(
              'bg-background min-h-0 overflow-y-auto p-4',
              viewMode === 'split' && 'border-t md:border-t-0 md:border-l',
              isFullscreen && 'h-full',
            )}
            style={
              !isFullscreen
                ? { minHeight: effectiveMinHeight, maxHeight: effectiveMaxHeight }
                : undefined
            }
          >
            <MarkdownContent
              content={normalizedValue}
              mode={config.renderMode}
              allowImages={config.allowImages}
              showHeadingAnchors={false}
              emptyFallback={<p className="text-muted-foreground text-sm">{config.placeholder}</p>}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <EditorStatusBar
        config={config}
        charCount={charCount}
        wordCount={wordCount}
        isEmpty={isMarkdownStructurallyEmpty(normalizedValue)}
        saveState={saveState}
        issues={issues}
      />
    </div>
  )

  if (isFullscreen) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsFullscreen(false)} />
        {editorPanel}
      </>
    )
  }

  return editorPanel
}
