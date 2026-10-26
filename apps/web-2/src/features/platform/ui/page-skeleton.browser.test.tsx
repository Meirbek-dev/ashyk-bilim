import { expect, test } from 'vite-plus/test'

import { renderInRouter } from '#/shared/components/testing'

import { PageSkeleton } from './page-skeleton'

/** The width of the first item's thumbnail in a page of the given width (the third skeleton, after title and bar). */
const thumbnailWidth = async (width: 'w-90' | 'w-250') => {
  await renderInRouter(
    <div data-width={width} className={width}>
      <PageSkeleton shape="media" />
    </div>,
  )
  const skeletons = () => document.querySelectorAll(`[data-width="${width}"] [data-slot=skeleton]`)
  await expect.poll(() => skeletons().length).toBeGreaterThan(2)
  return skeletons()[2]?.getBoundingClientRect().width
}

test('«Мои курсы» loads as thumbnail rows on a phone and as cover cards on a wide page, like its items', async () => {
  expect(await thumbnailWidth('w-90')).toBe(96) // 360 px
  expect(await thumbnailWidth('w-250')).toBeGreaterThan(200) // 1000 px
})
