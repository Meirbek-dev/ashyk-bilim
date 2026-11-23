import { expect, test } from 'vite-plus/test'
import { CourseCover } from './course-cover'
import { renderInRouter } from './testing'

const requested = (path: string) =>
  performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === path)

test('a picture that fails to load gives way to the brand cover', async () => {
  await renderInRouter(<CourseCover imageKey="courses/gone.png" className="w-64" />)
  await expect.poll(() => document.querySelector('.ab-cover-emblem')).not.toBeNull()
  expect(document.querySelector('.ab-cover img')).toBeNull()
})

test('a card asks for the preview at its width first, then the original', async () => {
  await renderInRouter(<CourseCover imageKey="course-thumbnail/no-preview" className="w-64" />)
  await expect.poll(() => document.querySelector('.ab-cover-emblem')).not.toBeNull()
  // 256 px at the test's density 1: the 320 px preview covers it; missing here, so the original was tried too.
  expect(requested('/content/course-thumbnail/no-preview.w320')).toBe(true)
  expect(requested('/content/course-thumbnail/no-preview')).toBe(true)
})
