import { describe, expect, test } from 'vite-plus/test'

import { contentSchema, discussionSchema } from './index'

// linkify knows http and https; a Link extension that registers a scheme does it in onCreate, which warns
// "linkifyjs: already initialized" for every editor mounted after the first link was scanned (a reply under a post).
const linkSchemes = (extensions: ReturnType<typeof contentSchema>) =>
  extensions.flatMap(extension => {
    const link: unknown = Reflect.get(extension.options ?? {}, 'link')
    return link && typeof link === 'object' ? [Reflect.get(link, 'protocols') ?? []] : []
  })

describe('link schemes', () => {
  test('no schema registers a custom link scheme: two editors on a page do not re-register (linkifyjs warning)', () => {
    for (const schema of [contentSchema(), discussionSchema()]) expect(linkSchemes(schema)).toEqual([[]])
  })
})
