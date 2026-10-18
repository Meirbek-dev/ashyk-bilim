import { describe, expect, it } from 'vite-plus/test'

import { resolveEmbedType } from '../../components/Objects/Editor/Extensions/EmbedBlock/embed-validators'

// The new web writes `embedBlock {type: 'url'}` for a page of a catalog service; this web renders it by host.
describe('resolveEmbedType', () => {
  it('maps a new-web `url` embed to the catalog provider of its host', () => {
    expect(resolveEmbedType('url', 'https://www.figma.com/file/abc')).toBe('figma')
    expect(resolveEmbedType('url', 'https://miro.com/app/board/x=/')).toBe('miro')
  })

  it('keeps known types and leaves an address off the catalog unknown', () => {
    expect(resolveEmbedType('youtube', 'https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(resolveEmbedType('url', 'https://example.org/page')).toBe('url')
    expect(resolveEmbedType('url', null)).toBe('url')
    expect(resolveEmbedType(null, 'https://miro.com/x')).toBeNull()
  })
})
