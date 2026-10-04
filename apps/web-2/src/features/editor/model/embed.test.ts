import * as fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import type { EditorNode } from './document'
import { embedSandbox, embedSrc, embedTypeForUrl, youTubeId } from './embed'
import { normalizeDocument } from './normalize'

const url = fc.oneof(
  fc.webUrl({ validSchemes: ['https', 'http'] }),
  fc.constantFrom(
    'https://www.youtube.com/watch?v=F9UC9DY-vIU',
    'https://docs.google.com/document/d/1C0g/edit?usp=sharing',
    'https://forms.gle/abc',
    'javascript:alert(1)',
    '',
  ),
)
const legacyEmbed = fc.record(
  {
    embedUrl: fc.option(url),
    embedCode: fc.option(
      fc.oneof(
        fc.string(),
        url.map(src => `<iframe src="${src}"></iframe>`),
      ),
    ),
    embedType: fc.constantFrom('url', 'code', null),
    embedHeight: fc.option(fc.oneof(fc.integer({ min: 100, max: 2000 }), fc.integer().map(String))),
    embedWidth: fc.option(fc.constantFrom('100%', '91%', '60%')),
    alignment: fc.constantFrom('left', 'center'),
  },
  { requiredKeys: [] },
)
const node: fc.Arbitrary<EditorNode> = fc.letrec<{ node: EditorNode }>(tie => ({
  node: fc.oneof(
    { depthSize: 'small' },
    legacyEmbed.map(attrs => ({ type: 'blockEmbed', attrs })),
    fc.record({ type: fc.constant('youtube'), attrs: fc.record({ src: url, height: fc.nat() }) }),
    fc.record({ type: fc.constant('codeBlock'), attrs: fc.record({ language: fc.option(fc.string()) }) }),
    fc.record({ type: fc.constant('calloutInfo'), content: fc.array(tie('node'), { maxLength: 3 }) }),
  ),
})).node

const types = (item: EditorNode): string[] => [item.type ?? '', ...(item.content ?? []).flatMap(types)]

describe('B-EDT-02 embed normalization (property)', () => {
  test('B-EDT-02 normalizeDocument is idempotent and leaves no legacy node behind', () => {
    fc.assert(
      fc.property(fc.array(node, { maxLength: 5 }), content => {
        const once = normalizeDocument({ type: 'doc', content })
        expect(normalizeDocument(once)).toEqual(once)
        const left = typeof once === 'string' ? [] : once.content.flatMap(types)
        expect(left.filter(type => type === 'blockEmbed' || type === 'youtube')).toEqual([])
      }),
      { numRuns: 300 },
    )
  })
})

describe('B-EDT-08 embed addresses', () => {
  test('B-EDT-08 an iframe never gets a non-https address (property)', () => {
    fc.assert(
      fc.property(fc.option(fc.string()), fc.oneof(url, fc.string()), (type, value) => {
        const src = embedSrc(type, value)
        expect(src === null || src.startsWith('https://')).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  test('B-EDT-03 B-EDT-08 YouTube URLs and ids embed through youtube-nocookie only', () => {
    for (const value of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?list=x',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ]) {
      expect(youTubeId(value)).toBe('dQw4w9WgXcQ')
      expect(embedSrc('youtube', value)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0')
    }
    expect(embedSrc('youtube', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  test('B-EDT-08 providers rewrite their page address to the embeddable one', () => {
    expect(embedTypeForUrl('https://docs.google.com/document/d/1/edit?usp=sharing')).toBe('google-docs')
    expect(embedSrc('google-docs', 'https://docs.google.com/document/d/1/edit?usp=sharing')).toBe(
      'https://docs.google.com/document/d/1/preview',
    )
    expect(embedTypeForUrl('https://forms.gle/x')).toBe('google-forms')
    expect(embedSrc('excalidraw', 'https://excalidraw.com/#json=a,b')).toBe('https://excalidraw.com/?embed=1#json=a,b')
    expect(embedTypeForUrl('https://ppt-online.org/1')).toBe('url')
    expect(embedSrc('url', 'https://ppt-online.org/1')).toBe('https://ppt-online.org/1')
    expect(embedSrc('unknown-old-provider', 'https://h5p.org/x')).toBe('https://h5p.org/x')
    expect(embedSrc('url', 'javascript:alert(1)')).toBeNull()
  })
})

describe('B-EDT-21 embeds frame known services only', () => {
  test('B-EDT-21 our origin, relative, storage and unknown pages never become an iframe', () => {
    for (const value of [
      'https://ashyq.example/ab-private/k.html?X-Amz-Signature=s',
      'https://evil.example/',
      '/content/x.html',
      '/ab-public/x.html',
      '//evil.example/x',
      'https://youtube.com.evil.example/x',
    ]) {
      for (const type of ['url', 'unknown-old-provider', 'codepen', null]) expect(embedSrc(type, value)).toBeNull()
    }
    expect(embedSrc('url', 'https://user:pass@www.figma.com/file/x')).toBeNull()
    expect(embedSrc('url', 'https://ppt-online.org/1')).toBe('https://ppt-online.org/1')
    expect(embedSrc('url', 'https://www.geogebra.org/m/abc')).toBe('https://www.geogebra.org/m/abc')
  })

  test('B-EDT-21 only provider players keep their own origin in the sandbox', () => {
    const youtube = embedSrc('youtube', 'dQw4w9WgXcQ') ?? ''
    expect(embedSandbox(youtube)).toContain('allow-same-origin')
    expect(embedSandbox('https://ppt-online.org/1')).not.toContain('allow-same-origin')
    expect(embedSandbox('/content/x.html')).not.toContain('allow-same-origin')
    expect(embedSandbox(youtube)).not.toContain('allow-top-navigation')
  })

  test('B-EDT-03 bare text is a YouTube id only in the 11-character id form', () => {
    expect(youTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    for (const value of ['hello-there-world', 'abcdef', 'dQw4w9WgXcQx', 'dQw4w9WgXc!'])
      expect(youTubeId(value)).toBeNull()
    expect(embedTypeForUrl('just-some-text')).toBe('url')
    expect(embedSrc(null, 'just-some-text')).toBeNull()
  })
})
