import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { AssessmentId, AssessmentItem } from '#/shared/api/gen/types.gen'
import { assessmentMediaUrl, ItemMedia } from '#/shared/components/item-media'

import { extraPrompt, isPlainPrompt, promptMedia } from '../model/attempt'

type ItemPromptProps = { item: AssessmentItem; assessmentId: AssessmentId; number: number }

/**
 * A question's prompt under its title, then its pictures. A plain prompt (an imported spreadsheet's) is text as typed,
 * line breaks kept, never markdown; a picture without its own alt text says which question it belongs to.
 */
export function ItemPrompt({ item, assessmentId, number }: ItemPromptProps) {
  const prompt = extraPrompt(item)
  const alt = m.attempt_question_image({ number })
  const media = promptMedia(item.body).map(picture => ({ ...picture, alt: picture.alt || alt }))
  return (
    <>
      {prompt && isPlainPrompt(item.body) ? <p className="wrap-anywhere whitespace-pre-wrap">{prompt}</p> : null}
      {prompt && !isPlainPrompt(item.body) ? (
        <Suspense fallback={null}>
          <MarkdownView content={prompt} />
        </Suspense>
      ) : null}
      <ItemMedia media={media} src={uploadId => assessmentMediaUrl(assessmentId, uploadId)} />
    </>
  )
}
