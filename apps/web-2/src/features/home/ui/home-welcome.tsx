import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { CourseGrid, landingCoursesOptions } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'

import { suggestedCourses, welcomeState } from '../model/suggestions'
import { enrollmentsOptions } from '../queries'

const welcomeText = {
  new: m.home_empty,
  done: m.home_all_done,
  archived: m.home_archived_left,
  waiting: m.home_nothing_next,
} satisfies Record<ReturnType<typeof welcomeState>, () => string>

/**
 * Today with nothing in it (B-HOME-07, B-HOME-09): the way to the catalog and, so a first visit is not a blank page,
 * the newest public courses as cards (read by the loader). A learner with courses but nothing to continue is told why
 * (finished, archived, no next lesson yet: B-HOME-10): the way back to them and their certificates comes too, the cards are "more courses".
 */
export function HomeWelcome() {
  const { data } = useSuspenseQuery(landingCoursesOptions())
  const state = welcomeState(useSuspenseQuery(enrollmentsOptions()).data.runs)
  const finished = state !== 'new'
  const session = useSuspenseQuery(sessionOptions()).data
  const courses = suggestedCourses(data.items, session?.user.id)
  // A teacher's first sign-in lands here, in «Учёба»: the way to their own space, not only the catalog (B-HOME-12).
  const teaches = hasCapability(session, 'teach')
  const lead = teaches && !finished ? 'teach' : 'learn'
  return (
    <div className="flex w-full flex-col items-start gap-10 py-2">
      <div className="flex flex-col items-start gap-4">
        <p className="text-muted-foreground">{welcomeText[state]()}</p>
        <div className="flex flex-wrap gap-2">
          {/* A teacher who learns nothing yet came to teach: that is the one primary action (B-HOME-12). */}
          {lead === 'teach' ? (
            <RouterLink to="/teach" className={buttonVariants()}>
              {m.home_go_teach()}
            </RouterLink>
          ) : null}
          <RouterLink to="/courses" className={buttonVariants({ variant: lead === 'teach' ? 'outline' : 'default' })}>
            {finished ? m.home_find_next_course() : m.home_find_course()}
          </RouterLink>
          {finished ? (
            <RouterLink to="/learning" className={buttonVariants({ variant: 'outline' })}>
              {m.home_my_courses()}
            </RouterLink>
          ) : null}
          {teaches && lead !== 'teach' ? (
            <RouterLink to="/teach" className={buttonVariants({ variant: 'outline' })}>
              {m.home_go_teach()}
            </RouterLink>
          ) : null}
        </div>
      </div>
      {courses.length > 0 ? (
        <section aria-labelledby="home-suggested" className="flex w-full flex-col gap-4">
          <h2 id="home-suggested" className="text-xl font-semibold">
            {finished ? m.home_more_title() : m.home_suggested_title()}
          </h2>
          <CourseGrid courses={courses} level={3} />
        </section>
      ) : null}
    </div>
  )
}
