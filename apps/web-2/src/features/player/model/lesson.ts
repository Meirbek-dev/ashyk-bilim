import { normalizeDocument } from '#/features/editor'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

const doc = (node: Record<string, unknown>) => ({ type: 'doc', content: [node] })

/** A stored file key as the editor's file blocks keep it (`/content/<key>`). */
const fileBlock = (type: 'blockVideo' | 'blockPDF', key: string) =>
  doc({ type, attrs: { blockObject: { content: { file_key: key } } } })

/**
 * What the editor's view preset shows for a lesson: the page itself, or a one-block document that reuses the
 * editor's video, YouTube and PDF blocks. Null = nothing to show. The contract types `content` as unknown: the
 * shapes (`uri` / `filename`) are the stored ones of the old web. Not in the loader's import path: the editor's
 * normalizer stays out of the entry chunk.
 */
export function lessonDocument(type: string, subType: string, content: unknown): unknown {
  const fields = isRecord(content) ? content : {}
  if (type === 'video') {
    const uri = text(fields['uri'])
    const key = text(fields['filename'])
    if (subType === 'video_youtube' && uri)
      return doc({ type: 'embedBlock', attrs: { type: 'youtube', url: uri, width: '100%', height: 480 } })
    return key ? fileBlock('blockVideo', key) : null
  }
  if (type === 'document') {
    const key = text(fields['filename'])
    return key ? fileBlock('blockPDF', key) : null
  }
  const page = normalizeDocument(content)
  if (typeof page === 'string') return page.trim() ? page : null
  return page.content.every(node => node.type === 'paragraph' && !node.content?.length) ? null : page
}
