import type { ComponentType } from 'react'

import type { WorkKind } from '../model/queue'

/**
 * The review page's right panel (FocusPage `aside`): the AI submission analysis of slice 6.3 mounts here with the
 * work under review. Without one the page has no panel.
 */
export type ReviewAside = {
  label: string
  /** `onFeedbackDraft`: a text for the grade form's feedback (appended to what is written, B-GRD-31). */
  Panel: ComponentType<{ kind: WorkKind; submissionId: string; onFeedbackDraft: (text: string) => void }>
}
