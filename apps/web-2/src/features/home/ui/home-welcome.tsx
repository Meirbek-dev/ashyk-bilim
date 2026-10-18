import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { CourseGrid, landingCoursesOptions } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

/**
 * Today with nothing in it (B-HOME-07, B-HOME-09): the way to the catalog and, so a first visit is not a blank page,
 * the newest public courses as cards (read by the loader).
 */
export function HomeWelcome() {
  const { data } = useSuspenseQuery(landingCoursesOptions())
  const courses = data.items.slice(0, 3)
  return (
    <div className="flex w-full flex-col items-start gap-10">
      <RouterLink to="/courses" className={buttonVariants()}>
        {m.home_find_course()}
      </RouterLink>
      {courses.length > 0 ? (
        <section aria-labelledby="home-suggested" className="flex w-full flex-col gap-4">
          <h2 id="home-suggested" className="text-xl font-semibold">
            {m.home_suggested_title()}
          </h2>
          <CourseGrid courses={courses} level={3} />
        </section>
      ) : null}
    </div>
  )
}
