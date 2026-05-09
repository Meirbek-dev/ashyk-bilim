import type { ActivityRef } from './editor-types';
import { createEditorExtensions } from './editor-kernel';
import type { EditorExtension } from './editor-kernel';

export type { EditorExtension } from './editor-kernel';

export function createAuthoringEditorExtensions(activity: ActivityRef): EditorExtension[] {
  return createEditorExtensions({ preset: 'authoring', activity });
}

export function createInteractiveCanvasExtensions(activity: ActivityRef): EditorExtension[] {
  return createEditorExtensions({ preset: 'interactive', activity });
}

export function createDiscussionEditorExtensions(): EditorExtension[] {
  return createEditorExtensions({ preset: 'discussion' });
}

export function createViewingEditorExtensions(): EditorExtension[] {
  return createEditorExtensions({ preset: 'viewing' });
}
