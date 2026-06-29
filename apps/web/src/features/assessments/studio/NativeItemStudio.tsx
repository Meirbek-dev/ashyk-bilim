'use client'

export { NativeItemStudioProvider, useAssessmentStudioContext } from './context'
export { NativeItemOutline } from './components/NativeItemOutline'
export { NativeItemAuthor } from './components/NativeItemAuthor'

export type { SupportedStudioItemKind, StudioMode, AssessmentLifecycle, AssessmentStudioDetail } from './utils'
export type { AssessmentEditorState, EditableItem, StudioTab } from './studioTypes'
export type { SaveState } from '@/features/assessments/shared/SaveStateBadge'
