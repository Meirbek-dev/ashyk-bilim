import { Suspense } from 'react'

import { MarkdownEditor, MarkdownView } from '#/features/markdown'
import { Skeleton } from '#/shared/ui/skeleton'

type MarkdownFieldProps = { label: string; value: string; onChange: (markdown: string) => void; editable: boolean }

/** A markdown part of a question (prompt, explanation, rubric): the editor, or the rendered text when read-only. */
export function MarkdownField({ label, value, onChange, editable }: MarkdownFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      <Suspense fallback={<Skeleton className="h-row w-full" />}>
        {editable ? (
          <MarkdownEditor label={label} value={value} onChange={onChange} />
        ) : (
          <MarkdownView content={value} />
        )}
      </Suspense>
    </div>
  )
}
