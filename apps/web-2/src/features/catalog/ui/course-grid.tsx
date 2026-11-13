import type { ComponentProps } from 'react'

import { CourseItem } from './course-item'

type CourseGridProps = {
  courses: readonly ComponentProps<typeof CourseItem>['course'][]
  level?: 2 | 3
}

/**
 * The shelf: one course across on a phone, two from @lg, three from @4xl of the page's container: pictures stay legible.
 * Every card lends its four lines (picture, name with authors, progress, description and marks) to the row it stands in
 * (subgrid), so the bars, descriptions and marks of neighbours sit on shared lines whatever each card has. The space between
 * rows is the cards' own bottom padding: a row gap would also open between the lines of one card.
 */
export function CourseGrid({ courses, level }: CourseGridProps) {
  return (
    <div className="flow-root">
      <ul className="-mb-10 grid gap-x-6 @lg:grid-cols-2 @4xl:grid-cols-3">
        {courses.map(course => (
          <li key={course.id} className="row-span-4 grid grid-rows-subgrid pb-10">
            <CourseItem course={course} level={level} />
          </li>
        ))}
      </ul>
    </div>
  )
}
