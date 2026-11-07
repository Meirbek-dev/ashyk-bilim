import type { ComponentProps } from 'react'

import { CourseItem } from './course-item'

type CourseGridProps = {
  courses: readonly ComponentProps<typeof CourseItem>['course'][]
  level?: 2 | 3
}

/** The shelf: one course across on a phone, two from @lg, three from @4xl of the page's container: pictures stay legible. */
export function CourseGrid({ courses, level }: CourseGridProps) {
  return (
    <ul className="grid gap-x-6 gap-y-10 @lg:grid-cols-2 @4xl:grid-cols-3">
      {courses.map(course => (
        <li key={course.id}>
          <CourseItem course={course} level={level} />
        </li>
      ))}
    </ul>
  )
}
