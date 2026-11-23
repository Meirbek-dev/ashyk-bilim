import { Mathematics } from '@tiptap/extension-mathematics'

// KaTeX and the math syntax load only for texts that contain `$` (most do not); the renderer links the stylesheet.
export { default as katex } from 'katex'
export { default as katexCss } from 'katex/dist/katex.min.css?url'

/** The parser's math extension, one array for the process (the parser caches its manager by it). */
export const mathSchema = [Mathematics]
