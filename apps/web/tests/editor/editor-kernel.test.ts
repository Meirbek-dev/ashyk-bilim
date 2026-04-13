import { describe, expect, it } from 'vitest';

import { EMPTY_TIPTAP_DOC } from '../../components/Objects/Editor/core/editor-content';
import {
  createEditorKernel,
  getEditorPresetDefinition,
  resolveEditorContent,
} from '../../components/Objects/Editor/core';

describe('editor kernel', () => {
  it('defines the four canonical presets', () => {
    expect(getEditorPresetDefinition('authoring')).toMatchObject({
      mode: 'authoring',
      isEditable: true,
      supportsAI: true,
      requiresActivity: true,
    });
    expect(getEditorPresetDefinition('interactive')).toMatchObject({
      mode: 'interactive',
      isEditable: false,
      supportsOutline: true,
      requiresActivity: true,
    });
    expect(getEditorPresetDefinition('discussion')).toMatchObject({
      isEditable: true,
      requiresActivity: false,
    });
    expect(getEditorPresetDefinition('viewing')).toMatchObject({
      mode: 'viewing',
      isEditable: false,
      requiresActivity: false,
    });
  });

  it('requires activity context for activity presets', () => {
    expect(() => createEditorKernel({ preset: 'authoring' })).toThrow(/requires an activity context/i);
    expect(() => createEditorKernel({ preset: 'interactive' })).toThrow(/requires an activity context/i);
  });

  it('normalizes invalid content to an empty document', () => {
    expect(resolveEditorContent(null)).toEqual(EMPTY_TIPTAP_DOC);
    expect(resolveEditorContent('not-json')).toEqual(EMPTY_TIPTAP_DOC);
  });

  it('builds stable viewing and discussion kernels without activity context', () => {
    const viewingKernel = createEditorKernel({ preset: 'viewing' });
    const discussionKernel = createEditorKernel({ preset: 'discussion' });

    expect(viewingKernel.preset.isEditable).toBe(false);
    expect(discussionKernel.preset.isEditable).toBe(true);
    expect(viewingKernel.extensions.length).toBeGreaterThan(0);
    expect(discussionKernel.extensions.length).toBe(viewingKernel.extensions.length);
  });
});
