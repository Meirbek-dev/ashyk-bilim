import { Fragment } from 'react'

/** A question's title as text; authors write `code` in backticks there, and it reads as code, not as punctuation. */
export function TitleText({ text }: { text: string }) {
  const parts = text.split(/`([^`\n]+)`/u)
  if (parts.length === 1) return text
  return parts.map((part, index) =>
    // Pieces of one title never reorder; every odd one was between backticks.
    index % 2 === 1 ? (
      <code key={index} className="font-mono text-[0.85em]">
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}
