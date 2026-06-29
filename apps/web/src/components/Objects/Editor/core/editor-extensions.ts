import type { ActivityRef } from './editor-types'
import { createEditorExtensions } from './editor-kernel'
import type { EditorExtension } from './editor-kernel'

export type { EditorExtension } from './editor-kernel'

export function createAuthoringEditorExtensions(activity: ActivityRef): EditorExtension[] {
  return createEditorExtensions({ preset: 'authoring', activity })
}
