import { expect, test } from 'vite-plus/test'
import { CourseCover } from './course-cover'
import { renderInRouter } from './testing'

test('a picture that fails to load gives way to the brand cover', async () => {
  await renderInRouter(<CourseCover imageKey="courses/gone.png" className="w-64" />)
  await expect.poll(() => document.querySelector('.ab-cover-emblem')).not.toBeNull()
  expect(document.querySelector('.ab-cover img')).toBeNull()
})
