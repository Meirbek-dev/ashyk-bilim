import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { buttonVariants } from '#/shared/components/button-variants'
import { CourseCover } from '#/shared/components/course-cover'
import { ListState } from '#/shared/components/list-state'

import { landingLead, localizedPlatform } from '../model/catalog'
import { landingCoursesOptions, platformOptions } from '../queries'
import { CourseGrid } from './course-grid'
import { LandingInside } from './landing-inside'
import { LandingSteps } from './landing-steps'

// How many of the newest courses stand beside the title.
const HERO_COVERS = 4
const SHELF_COURSES = 6

/**
 * The guest's `/`, the platform's name and promise beside pictures of its real courses, then what
 * a course is made of, how to start, and the shelf; the catalog itself is `/courses`.
 */
export function LandingPage() {
  const { data } = useSuspenseQuery(platformOptions())
  const platform = localizedPlatform(data, getLocale())
  const courses = useSuspenseQuery(landingCoursesOptions())
  const lead = landingLead(platform) ?? m.catalog_landing_lead()
  // The shelf takes the newest six; the hero shows others, so one picture never stands twice on the page.
  const stack = courses.data.items
    .slice(SHELF_COURSES)
    .filter(course => course.thumbnail_key)
    .slice(0, HERO_COVERS)
  return (
    <section className="@container flex flex-col gap-20 pb-8 @3xl:gap-28">
      <header className="grid items-center gap-12 pt-8 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @3xl:gap-16 @3xl:pt-16">
        <div className="flex flex-col items-start gap-7">
          <p className="text-xl text-muted-foreground">{m.platform_brand_motto()}</p>
          <h1 className="text-display font-semibold wrap-anywhere">{platform.name}</h1>
          <p className="max-w-prose text-lg wrap-anywhere whitespace-pre-line text-muted-foreground">{lead}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <RouterLink to="/signup" className={buttonVariants({ size: 'lg' })}>
              {m.catalog_landing_signup()}
            </RouterLink>
            <RouterLink to="/courses" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              {m.catalog_landing_all_courses()}
            </RouterLink>
          </div>
        </div>
        {stack.length === HERO_COVERS ? (
          <div aria-hidden className="grid grid-cols-2 gap-3 @3xl:gap-4">
            {stack.map(course => (
              <CourseCover key={course.id} imageKey={course.thumbnail_key} />
            ))}
          </div>
        ) : null}
      </header>
      {/* «О платформе» once: not when it is the lead above (with or without the name it opens with). */}
      {platform.about.trim() && landingLead({ ...platform, description: '' }) !== lead ? (
        <p className="max-w-prose text-xl wrap-anywhere whitespace-pre-line">{platform.about}</p>
      ) : null}
      <LandingInside />
      <LandingSteps />
      <section aria-labelledby="landing-courses" className="flex flex-col gap-8">
        <h2 id="landing-courses" className="text-2xl font-semibold">
          {m.catalog_landing_courses_title()}
        </h2>
        <ListState
          pending={false}
          error={courses.error}
          count={courses.data.items.length}
          filtered={false}
          emptyText={m.catalog_courses_empty()}
          onRetry={() => void courses.refetch()}
        >
          <CourseGrid courses={courses.data.items.slice(0, SHELF_COURSES)} level={3} />
          {/* The end of the page leads on, not into a dead end. */}
          <div className="pt-2">
            <RouterLink to="/courses" className={buttonVariants({ variant: 'outline' })}>
              {m.catalog_landing_all_courses()}
            </RouterLink>
          </div>
        </ListState>
      </section>
    </section>
  )
}
