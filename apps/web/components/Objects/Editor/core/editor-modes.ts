export type EditorMode = 'authoring' | 'interactive' | 'viewing';

export interface EditorModeState {
  mode: EditorMode;
  isEditable: boolean;
}
