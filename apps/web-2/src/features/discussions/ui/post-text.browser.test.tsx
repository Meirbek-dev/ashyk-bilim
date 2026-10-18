import { describe, expect, test } from 'vite-plus/test'

import { renderInRouter } from '#/shared/components/testing'

import { PostText } from './post-text'

const doc = (text: string) =>
  JSON.stringify({ type: 'doc', content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [] })

describe('post text', () => {
  test('B-DSC-17 a post shows its words before the viewer loads; an empty one keeps the skeleton', async () => {
    const screen = await renderInRouter(<PostText content={doc('Как сдать задачу?')} />)
    await expect.element(screen.getByText('Как сдать задачу?')).toBeVisible()
    const empty = await renderInRouter(<PostText content={doc('')} />)
    await expect.poll(() => empty.element().querySelector('[data-slot=skeleton]')).not.toBeNull()
  })
})
