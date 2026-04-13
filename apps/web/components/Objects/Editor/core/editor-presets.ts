import type { EditorMode } from './editor-modes';

export type EditorPresetName = 'authoring' | 'interactive' | 'viewing' | 'discussion';

export interface EditorPresetDefinition {
  name: EditorPresetName;
  mode: EditorMode;
  isEditable: boolean;
  supportsAI: boolean;
  supportsOutline: boolean;
  requiresActivity: boolean;
}

const EDITOR_PRESETS: Record<EditorPresetName, EditorPresetDefinition> = {
  authoring: {
    name: 'authoring',
    mode: 'authoring',
    isEditable: true,
    supportsAI: true,
    supportsOutline: false,
    requiresActivity: true,
  },
  interactive: {
    name: 'interactive',
    mode: 'interactive',
    isEditable: false,
    supportsAI: true,
    supportsOutline: true,
    requiresActivity: true,
  },
  viewing: {
    name: 'viewing',
    mode: 'viewing',
    isEditable: false,
    supportsAI: false,
    supportsOutline: false,
    requiresActivity: false,
  },
  discussion: {
    name: 'discussion',
    mode: 'authoring',
    isEditable: true,
    supportsAI: false,
    supportsOutline: false,
    requiresActivity: false,
  },
};

export function getEditorPresetDefinition(preset: EditorPresetName): EditorPresetDefinition {
  return EDITOR_PRESETS[preset];
}
