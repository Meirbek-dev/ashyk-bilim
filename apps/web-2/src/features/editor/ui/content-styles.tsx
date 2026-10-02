import katexCss from 'katex/dist/katex.min.css?url'

import { proseCss } from '#/features/markdown'

/**
 * The stylesheets of document content, linked once next to the editor (React hoists them into <head>).
 * Never inside a node view: a stylesheet that suspends a node-view portal stalls the editor.
 */
export function ContentStyles() {
  return (
    <>
      <link rel="stylesheet" href={proseCss} precedence="ab-prose" />
      <link rel="stylesheet" href={katexCss} precedence="ab-katex" />
    </>
  )
}
