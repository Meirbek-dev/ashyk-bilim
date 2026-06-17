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
}

/**
 * Unified hook that wraps Tiptap's useEditor() and standardizes
 * initialization across all editor surfaces (authoring, interactive, discussion).
 */
export function useEditorInstance(options: UseEditorInstanceOptions) {
  const { preset, activity, content, onUpdate, overrides } = options

  const presetDef = getEditorPresetDefinition(preset)

  // Memoize extensions — only recompute when preset or activity identity changes
  const extensions = useMemo(
    () => createEditorExtensions({ preset, ...(activity === undefined ? {} : { activity }) }),
    [preset, activity],
  )

  const editor = useEditor(
    {
      extensions,
      content: resolveEditorContent(content),
      immediatelyRender: false,
      injectCSS: false,
      shouldRerenderOnTransaction: preset === 'discussion',
      editable: presetDef.isEditable,
      ...(onUpdate === undefined ? {} : { onUpdate: ({ editor }) => onUpdate(editor.getJSON()) }),
      ...overrides,
    },
    [preset, activity?.activity_uuid],
  )

  // Keep editor content in sync when `content` prop changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const newContent = resolveEditorContent(content)
    const currentContent = editor.getJSON()

    if (JSON.stringify(currentContent) !== JSON.stringify(newContent)) {
      editor.commands.setContent(newContent, { emitUpdate: false })
    }
  }, [editor, content])

  return editor
}
