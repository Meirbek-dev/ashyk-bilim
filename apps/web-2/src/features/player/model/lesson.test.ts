import { describe, expect, test } from 'vite-plus/test'

import { lessonDocument, pageWithOutline } from './lesson'

describe('lesson content', () => {
  test('B-PLY-08 a page is shown as stored; an empty page has nothing to show', () => {
    const page = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Привет' }] }] }
    expect(lessonDocument('dynamic', 'dynamic_page', page)).toEqual(page)
    expect(lessonDocument('dynamic', 'dynamic_page', { type: 'doc', content: [{ type: 'paragraph' }] })).toBeNull()
    expect(lessonDocument('dynamic', 'dynamic_page', null)).toBeNull()
    expect(lessonDocument('dynamic', 'dynamic_page', '<p>old</p>')).toBe('<p>old</p>')
  })

  test('B-PLY-09 a video becomes a YouTube embed or a stored-file video block; no source is nothing', () => {
    const youtube = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(lessonDocument('video', 'video_youtube', { uri: youtube })).toEqual({
      type: 'doc',
      content: [{ type: 'embedBlock', attrs: { type: 'youtube', url: youtube, width: '100%', height: 480 } }],
    })
    expect(lessonDocument('video', 'video_hosted', { filename: 'videos/a.mp4' })).toEqual({
      type: 'doc',
      content: [{ type: 'blockVideo', attrs: { blockObject: { content: { file_key: 'videos/a.mp4' } } } }],
    })
    expect(lessonDocument('video', 'video_youtube', {})).toBeNull()
    expect(lessonDocument('video', 'video_hosted', { filename: ' ' })).toBeNull()
  })

  test('B-PLY-10 a document becomes a PDF block; no file is nothing', () => {
    expect(lessonDocument('document', 'document_pdf', { filename: 'docs/a.pdf' })).toEqual({
      type: 'doc',
      content: [{ type: 'blockPDF', attrs: { blockObject: { content: { file_key: 'docs/a.pdf' } } } }],
    })
    expect(lessonDocument('document', 'document_pdf', {})).toBeNull()
  })
})

const heading = (level: number, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
})

test('B-PLY-17 a page with two headings or more gets "On this page", depths below its top level', () => {
  const two = pageWithOutline({ type: 'doc', content: [heading(2, 'A'), heading(3, 'B')] })
  expect(two.outline.map(entry => [entry.text, entry.depth])).toEqual([
    ['A', 0],
    ['B', 1],
  ])
  expect(pageWithOutline({ type: 'doc', content: [heading(2, 'A')] }).outline).toEqual([])
  expect(pageWithOutline('<p>old</p>').outline).toEqual([])
})
