'use client'

import { useEditor } from '@tiptap/react'
import type { UseEditorOptions } from '@tiptap/react'
import { useEffect, useMemo } from 'react'
import { createEditorExtensions, resolveEditorContent } from './editor-kernel'
import type { EditorPresetName } from './editor-presets'
import { getEditorPresetDefinition } from './editor-presets'
import type { ActivityRef } from './editor-types'

export interface UseEditorInstanceOptions {
  preset: EditorPresetName
  activity?: ActivityRef
  content: unknown
  onUpdate?: (json: object) => void
  overrides?: Partial<UseEditorOptions>
  placeholder?: string
}

/**
 * Unified hook that wraps Tiptap's useEditor() and standardizes
 * initialization across all editor surfaces (authoring, interactive, discussion).
 */
export function useEditorInstance(options: UseEditorInstanceOptions) {
  const { preset, activity, content, onUpdate, overrides, placeholder } = options

  const presetDef = getEditorPresetDefinition(preset)

  // Memoize extensions — only recompute when preset or activity identity changes
  const extensions = useMemo(
    () =>
      createEditorExtensions({
        preset,
        ...(activity === undefined ? {} : { activity }),
        ...(placeholder === undefined ? {} : { placeholder }),
      }),
    [preset, activity, placeholder],
  )

  const editor = useEditor(
    {
      extensions,
      content: resolveEditorContent(content),
      immediatelyRender: false,
      injectCSS: false,
      shouldRerenderOnTransaction: preset === 'discussion',
      editable: presetDef.isEditable,
      ...(onUpdate === undefined ? {} : { onUpdate: ({ editor: ed }) => onUpdate(ed.getJSON()) }),
      ...overrides,
    },
    [preset, activity?.activity_uuid],
  )

  // Keep editor content in sync when `content` prop changes.
  // Deferred out of the commit phase: replacing content mounts React node views
  // (image/video blocks), and tiptap's ReactRenderer renders those with
  // flushSync, which React rejects from inside an effect.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const newContent = resolveEditorContent(content)
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(newContent)) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return
      editor.commands.setContent(newContent, { emitUpdate: false })
    })
    return () => {
      cancelled = true
    }
  }, [editor, content])

  return editor
}
