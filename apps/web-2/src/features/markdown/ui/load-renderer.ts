import { MarkdownDraft } from './markdown-draft'

/**
 * The renderer's chunk, loaded on first use. A network lost before it came in (a test started on a weak connection)
 * leaves the plain words in place (B-MD-10): the failed chunk threw to the route, and the learner lost the question
 * for an error page.
 */
export const loadRenderer = (load = () => import('./markdown-view')) =>
  load().then(
    module => ({ default: module.MarkdownView }),
    () => ({ default: MarkdownDraft }),
  )
