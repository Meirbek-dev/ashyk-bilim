import { extractPlainText } from '#/features/editor'
import { Skeleton } from '#/shared/ui/skeleton'

/** A post's words as plain text (B-DSC-17): what shows until the rich viewer has loaded; a post of images only waits. */
export function PostText({ content }: { content: string }) {
  const text = extractPlainText(content)
  return text ? <p className="wrap-anywhere">{text}</p> : <Skeleton className="h-4 w-2/3" />
}
