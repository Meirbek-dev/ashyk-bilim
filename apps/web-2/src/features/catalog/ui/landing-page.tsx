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
 * The guest's `/`, the platform's name and promise beside pictures of its real courses, then what a course is made
 * of, the shelf, and how to start; the catalog itself is `/courses`. Every part after the hero opens with a hairline
 * and the same step of space; the page closes on the three steps, whose links lead on.
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
    <section className="@container flex flex-col gap-16 pb-12 @3xl:gap-20 @3xl:pb-20">
      <header className="grid items-center gap-10 pt-6 @3xl:grid-cols-2 @3xl:gap-14 @3xl:pt-14 @3xl:pb-4">
        {/* Three steps of space: the motto belongs to the name, the lead to both, the actions stand apart. */}
        <div className="flex flex-col items-start gap-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <p className="text-lg text-muted-foreground">{m.platform_brand_motto()}</p>
              <h1 className="text-display font-semibold wrap-anywhere">{platform.name}</h1>
            </div>
            <p className="max-w-[34rem] text-lg text-pretty wrap-anywhere whitespace-pre-line text-muted-foreground">
              {lead}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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
        <p className="max-w-prose border-t pt-10 text-xl text-pretty wrap-anywhere whitespace-pre-line">
          {platform.about}
        </p>
      ) : null}
      <LandingInside />
      <section aria-labelledby="landing-courses" className="flex flex-col gap-8 border-t pt-10">
        {/* The way to the whole catalog stands on the title's line: the shelf is six of many. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 id="landing-courses" className="text-xl font-semibold">
            {m.catalog_landing_courses_title()}
          </h2>
          {courses.data.items.length > 0 ? (
            <RouterLink to="/courses" className={buttonVariants({ variant: 'outline' })}>
              {m.catalog_landing_all_courses()}
            </RouterLink>
          ) : null}
        </div>
        <ListState
          pending={false}
          error={courses.error}
          count={courses.data.items.length}
          filtered={false}
          emptyText={m.catalog_courses_empty()}
          onRetry={() => void courses.refetch()}
        >
          <CourseGrid courses={courses.data.items.slice(0, SHELF_COURSES)} level={3} />
        </ListState>
      </section>
      <LandingSteps />
    </section>
  )
}
