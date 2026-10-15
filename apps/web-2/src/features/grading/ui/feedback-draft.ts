import { createContext, use, useEffect } from 'react'

import { appendDraft } from '../model/grade-form'

type Take = (text: string) => void

/**
 * The review page's "write into the feedback" hook (B-GRD-31): the grade form on the page registers how to take a
 * text (registering answers the unregister), the side panel (AI analysis) offers one.
 */
export const FeedbackDraft = createContext<((take: Take) => () => void) | null>(null)

/** Lets the side panel's drafts reach this form's feedback: appended under what is written, never replacing it. */
export function useFeedbackDraft(apply: (update: (current: string) => string) => void) {
  const register = use(FeedbackDraft)
  useEffect(() => register?.(text => apply(current => appendDraft(current, text))), [register, apply])
}
