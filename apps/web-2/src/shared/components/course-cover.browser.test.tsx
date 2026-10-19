import { expect, test } from 'vite-plus/test'
import { CourseCover } from './course-cover'
import { renderInRouter } from './testing'

test('a picture that fails to load gives way to the ornament', async () => {
  const screen = await renderInRouter(<CourseCover seed="course-1" imageKey="courses/gone.png" className="w-64" />)
  await expect.poll(() => screen.element().querySelector('svg')).not.toBeNull()
  expect(screen.element().querySelector('img')).toBeNull()
})
