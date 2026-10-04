import { describe, expect, test } from 'vite-plus/test'

import {
  EMPTY_DOCUMENT,
  extractPlainText,
  normalizeDocument,
  stripEmptyFileBlocks,
  type EditorDocument,
} from '../index'
import { FIXTURES, LEGACY_EMBED } from './fixtures'
import { headingIdUpdates, slugify } from './heading-ids'
import { findLosses, serializeWith } from './round-trip'
import { contentSchema, discussionSchema } from './schema'

const serialize = serializeWith(contentSchema())
const embed = (attrs: Record<string, unknown>) =>
  normalizeDocument({ type: 'doc', content: [{ type: 'blockEmbed', attrs }] })
const code = (language: unknown, text: string) =>
  normalizeDocument({
    type: 'doc',
    content: [{ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] }],
  })
const language = (value: ReturnType<typeof normalizeDocument>) =>
  typeof value === 'string' ? value : value.content[0]?.attrs?.['language']

describe('B-EDT-01 every node of the old schema survives load and save', () => {
  for (const [name, doc] of Object.entries(FIXTURES)) {
    test(`B-EDT-01 ${name}`, () => {
      const normalized = normalizeDocument(doc)
      expect(normalized).toEqual(doc)
      const saved = serialize(doc)
      expect(findLosses(doc, saved)).toEqual([])
      expect(serialize(saved)).toEqual(saved)
    })
  }

  test('B-EDT-01 an unknown node type is reported, never silently kept', () => {
    expect(() => serialize({ type: 'doc', content: [{ type: 'mystery' }] })).toThrow(/mystery/)
  })

  test('B-EDT-01 a dropped attribute is reported by findLosses', () => {
    const before = { type: 'doc', content: [{ type: 'blockImage', attrs: { alien: 1 } }] }
    expect(findLosses(before, serialize(before))).toEqual([{ path: 'doc/0', what: 'blockImage.alien dropped' }])
  })

  test('B-EDT-14 the discussion schema reads rich text, images and embeds', () => {
    const post: EditorDocument = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: '/content/a.png', alt: 'a', title: null, width: null, height: null } },
        FIXTURES['embedBlock']?.content[0] ?? {},
      ],
    }
    const saved = serializeWith(discussionSchema())(post)
    expect(findLosses(post, saved)).toEqual([])
  })
})

describe('B-EDT-02 legacy blockEmbed reads as embedBlock (D-01)', () => {
  test('B-EDT-02 maps url, width and height and detects the provider', () => {
    expect(normalizeDocument({ type: 'doc', content: [LEGACY_EMBED] })).toEqual({
      type: 'doc',
      content: [
        {
          type: 'embedBlock',
          attrs: {
            type: 'google-docs',
            url: 'https://docs.google.com/document/d/1C0g/edit?usp=sharing',
            width: '100%',
            height: 667,
          },
        },
      ],
    })
  })

  test('B-EDT-02 an embed code keeps its iframe src; unknown hosts are generic; empty embeds stay empty', () => {
    expect(
      embed({ embedCode: '<iframe width="560" src="https://ppt-online.org/1"></iframe>', embedHeight: '400' }),
    ).toEqual({
      type: 'doc',
      content: [
        { type: 'embedBlock', attrs: { type: 'url', url: 'https://ppt-online.org/1', width: '100%', height: 400 } },
      ],
    })
    expect(embed({})).toEqual({
      type: 'doc',
      content: [{ type: 'embedBlock', attrs: { type: null, url: null, width: '100%', height: 300 } }],
    })
  })

  test('B-EDT-02 nested embeds, JSON strings and junk', () => {
    const nested = JSON.stringify({ type: 'doc', content: [{ type: 'calloutInfo', content: [LEGACY_EMBED] }] })
    const normalized = normalizeDocument(nested)
    expect(JSON.stringify(normalized)).not.toContain('blockEmbed')
    expect(normalizeDocument(null)).toEqual(EMPTY_DOCUMENT)
    expect(normalizeDocument({ content: [] })).toEqual({ type: 'doc', content: [] })
    expect(normalizeDocument('<p>21</p>')).toBe('<p>21</p>')
  })
})

describe('B-EDT-03 YouTube is embedded one way', () => {
  test('B-EDT-03 a legacy youtube node becomes an embedBlock of type youtube', () => {
    const legacy = {
      type: 'doc',
      content: [{ type: 'youtube', attrs: { src: 'https://youtu.be/F9UC9DY-vIU', start: 0, width: 640, height: 480 } }],
    }
    expect(normalizeDocument(legacy)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'embedBlock',
          attrs: { type: 'youtube', url: 'https://youtu.be/F9UC9DY-vIU', width: '100%', height: 480 },
        },
      ],
    })
  })
})

describe('B-EDT-04 code block languages', () => {
  test('B-EDT-04 aliases normalize, unknown languages become plain text', () => {
    expect(language(code('Kotlin', 'class Book'))).toBe('kotlin')
    expect(language(code('kts', 'x'))).toBe('kotlin')
    expect(language(code('py', 'x'))).toBe('python')
    expect(language(code('brainfuck', 'x'))).toBeNull()
  })

  test('B-EDT-04 unlabeled legacy blocks that look like Kotlin are labeled', () => {
    for (const example of [
      'val topClassics = books.filter { it.rating >= 4.5 }',
      'object AppConfig {\n  const val BASE_URL = "https://openlibrary.org/"\n}',
      'val double: (Int) -> Int = { x -> x * 2 }',
    ])
      expect(language(code('', example))).toBe('kotlin')
    expect(language(code(null, 'print("hi")'))).toBeNull()
  })
})

describe('B-EDT-05 heading ids', () => {
  test('B-EDT-05 slugs keep Cyrillic and Kazakh letters and digits', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
    expect(slugify('ҚАЗАҚСТАН')).toBe('қазақстан')
    expect(slugify('Сурет: 1.2 — Схема')).toBe('сурет-12-схема')
    expect(slugify('   ')).toBe('')
  })

  test('B-EDT-05 stored ids are kept, missing and duplicate ids are filled uniquely', () => {
    expect(
      headingIdUpdates([
        { pos: 0, id: 'intro', text: 'Intro' },
        { pos: 5, id: 'intro', text: 'Intro' },
        { pos: 9, id: null, text: 'Intro' },
        { pos: 12, id: '', text: '' },
      ]),
    ).toEqual([
      { pos: 5, id: 'heading-intro-2' },
      { pos: 9, id: 'heading-intro-3' },
      { pos: 12, id: 'heading-section' },
    ])
  })
})

describe('B-EDT-06 placeholders without an upload are not saved', () => {
  test('B-EDT-06 drops empty file blocks recursively and never saves an empty body', () => {
    const uploaded = { block_uuid: 'b1', content: { file_id: 'f1', file_format: 'webp' } }
    const doc: EditorDocument = {
      type: 'doc',
      content: [
        { type: 'blockImage', attrs: { blockObject: null } },
        { type: 'blockImage', attrs: { blockObject: uploaded } },
        { type: 'calloutInfo', content: [{ type: 'blockPDF', attrs: { blockObject: null } }] },
        { type: 'blockVideo', attrs: {} },
      ],
    }
    expect(stripEmptyFileBlocks(doc).content).toEqual([
      { type: 'blockImage', attrs: { blockObject: uploaded } },
      { type: 'calloutInfo', content: [] },
    ])
    expect(stripEmptyFileBlocks({ type: 'doc', content: [{ type: 'blockVideo' }] })).toEqual(EMPTY_DOCUMENT)
  })
})

describe('B-EDT-07 plain text', () => {
  test('B-EDT-07 joins blocks with spaces and includes text kept in attributes', () => {
    const doc = {
      type: 'doc',
      content: [...(FIXTURES['quoteRuleBreak']?.content ?? []), ...(FIXTURES['flipcard']?.content ?? [])],
    }
    expect(extractPlainText(doc)).toBe('quote a b What is photosynthesis? Energy from light.')
    expect(extractPlainText('<p>21</p><p>двадцать</p>')).toBe('21 двадцать')
  })
})
