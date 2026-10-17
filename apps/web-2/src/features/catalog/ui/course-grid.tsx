import type { ComponentProps } from 'react'

import { CourseItem } from './course-item'

type CourseGridProps = {
  courses: readonly ComponentProps<typeof CourseItem>['course'][]
  level?: 2 | 3
}

/** Courses as cover cards: one column on phones, two from @xl, three from @4xl of the page's container. */
export function CourseGrid({ courses, level }: CourseGridProps) {
  return (
    <ul className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
      {courses.map(course => (
        <li key={course.id}>
          <CourseItem course={course} level={level} />
        </li>
      ))}
    </ul>
  )
}
