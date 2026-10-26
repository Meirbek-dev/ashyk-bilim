import { markdownPlainText } from '../model/plain-text'

/** The text while the renderer loads, or if it never does: each paragraph's plain words, at once and without a jump. */
const draft = (markdown: string) =>
  markdown
    .split(/\n\s*\n/)
    .map(markdownPlainText)
    .filter(Boolean)
    .join('\n\n')

export function MarkdownDraft({ content }: { content: string }) {
  return <p className="wrap-anywhere whitespace-pre-line">{draft(content)}</p>
}
