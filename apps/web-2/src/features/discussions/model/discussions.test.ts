import { describe, expect, test } from 'vite-plus/test'

import type { Discussion } from '#/shared/api/gen/types.gen'

import { applyReaction, appendItem, hasText, prependItem, removeItem, replaceItem } from './discussions'

const post = (id: string, patch: Partial<Discussion> = {}): Discussion => ({
  id,
  course_id: 'c1',
  content: 'text',
  allowed_actions: [],
  author: null,
  parent_id: null,
  can_delete: false,
  can_moderate: false,
  can_update: false,
  created_at_unix: 0,
  updated_at_unix: 0,
  dislikes_count: 0,
  likes_count: 0,
  is_disliked: false,
  is_liked: false,
  is_owner: false,
  replies: [],
  replies_count: 0,
  status: 'active',
  ...patch,
})

const pages = (...items: Discussion[][]) => ({
  pageParams: items.map(() => undefined),
  pages: items.map((page, index) => ({ items: page, next_cursor: index < items.length - 1 ? 'next' : null })),
})

const ids = (data: ReturnType<typeof prependItem>) => data?.pages.map(page => page.items.map(item => item.id))

describe('post text', () => {
  test('B-DSC-03 an empty editor document has no text; a paragraph or legacy HTML has', () => {
    expect(hasText(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }))).toBe(false)
    expect(hasText('')).toBe(false)
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Привет' }] }] }
    expect(hasText(JSON.stringify(doc))).toBe(true)
    expect(hasText('<p>Старый пост</p>')).toBe(true)
  })
})

describe('cache updates from mutation answers', () => {
  test('B-DSC-10 a new post goes first, an edit replaces in place, a delete removes', () => {
    const data = pages([post('b'), post('a')], [post('z')])
    expect(ids(prependItem(data, post('c')))).toEqual([['c', 'b', 'a'], ['z']])
    const edited = replaceItem(data, post('a', { content: 'new', replies: [] }))
    expect(edited?.pages[0]?.items[1]?.content).toBe('new')
    expect(ids(removeItem(data, 'a'))).toEqual([['b'], ['z']])
    expect(prependItem(undefined, post('c'))).toBeUndefined()
  })

  test('B-DSC-05 a new reply goes last, but not while older pages are still unloaded', () => {
    expect(ids(appendItem(pages([post('r1')]), post('r2')))).toEqual([['r1', 'r2']])
    const partial = { pageParams: [undefined], pages: [{ items: [post('r1')], next_cursor: 'more' }] }
    expect(ids(appendItem(partial, post('r2')))).toEqual([['r1']])
  })

  test('B-DSC-09 a reaction takes the counts and pressed state from the answer', () => {
    const data = pages([post('a', { likes_count: 1 })])
    const next = applyReaction(data, 'a', { likes_count: 2, dislikes_count: 0, is_liked: true, is_disliked: false })
    expect(next?.pages[0]?.items[0]).toMatchObject({ likes_count: 2, is_liked: true })
  })
})
