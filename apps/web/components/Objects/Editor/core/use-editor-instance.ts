'use client';

import { useEditor, type UseEditorOptions } from '@tiptap/react';
import { useMemo } from 'react';
import { createEditorExtensions, resolveEditorContent } from './editor-kernel';
import type { EditorPresetName } from './editor-presets';
import { getEditorPresetDefinition } from './editor-presets';
import type { ActivityRef } from './editor-types';

export interface UseEditorInstanceOptions {
  preset: EditorPresetName;
  activity?: ActivityRef;
  content: unknown;
  onUpdate?: (json: object) => void;
  overrides?: Partial<UseEditorOptions>;
}

/**
 * Unified hook that wraps Tiptap's useEditor() and standardizes
 * initialization across all editor surfaces (authoring, interactive, discussion).
 */
export function useEditorInstance(options: UseEditorInstanceOptions) {
  const { preset, activity, content, onUpdate, overrides } = options;

  const presetDef = getEditorPresetDefinition(preset);

  // Memoize extensions — only recompute when preset or activity identity changes
  const extensions = useMemo(
    () => createEditorExtensions({ preset, activity }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, activity?.activity_uuid],
  );

  // Resolve content once on mount
  const resolvedContent = useMemo(
    () => resolveEditorContent(content),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return useEditor({
    extensions,
    content: resolvedContent,
    immediatelyRender: false,
    editable: presetDef.isEditable,
    onUpdate: onUpdate ? ({ editor }) => onUpdate(editor.getJSON()) : undefined,
    ...overrides,
  });
}
