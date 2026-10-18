import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { buttonVariants } from '#/shared/components/button-variants'

import { landingLead } from '../model/catalog'
import { landingCoursesOptions, platformOptions } from '../queries'
import { CourseGrid } from './course-grid'
import { CoverWall } from './cover-wall'

// Seeds that top the wall up with ornaments on a platform with fewer than four courses.
const FILL = ['ashyq', 'bilim', 'oqu', 'jol']

/**
 * The guest's `/`: what the platform is beside a wall of its newest course pictures, how to start as three stitched
 * steps, a few courses; the catalog itself is `/courses`.
 */
export function LandingPage() {
  const { data: platform } = useSuspenseQuery(platformOptions())
  const courses = useSuspenseQuery(landingCoursesOptions())
  // Uploaded pictures first: they show what the courses are about; ornaments fill the rest.
  const wall = [
    ...courses.data.items
      .map(course => ({ seed: course.id, imageKey: course.thumbnail_key }))
      .toSorted((a, b) => Number(Boolean(b.imageKey)) - Number(Boolean(a.imageKey))),
    ...FILL.map(seed => ({ seed, imageKey: null })),
  ].slice(0, 4)
  const lead = landingLead(platform) ?? m.catalog_landing_lead()
  const steps = [
    { id: 'browse', body: <Link to="/courses">{m.catalog_landing_step_browse()}</Link> },
    { id: 'signup', body: m.catalog_landing_step_signup() },
    { id: 'learn', body: m.catalog_landing_step_learn() },
  ]
  return (
    <section className="@container flex flex-col gap-16 pb-8">
      <header className="grid items-center gap-10 pt-4 @3xl:grid-cols-2 @3xl:gap-12 @3xl:pt-8">
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-display font-semibold wrap-anywhere">{platform.name}</h1>
          <p className="max-w-prose text-lg wrap-anywhere whitespace-pre-line text-muted-foreground">{lead}</p>
          <div className="flex flex-wrap gap-2">
            <RouterLink to="/signup" className={buttonVariants({ size: 'lg', className: 'px-5' })}>
              {m.catalog_landing_signup()}
            </RouterLink>
            <RouterLink to="/courses" className={buttonVariants({ size: 'lg', variant: 'outline', className: 'px-5' })}>
              {m.catalog_landing_all_courses()}
            </RouterLink>
          </div>
        </div>
        <CoverWall tiles={wall} />
      </header>
      {platform.about.trim() && platform.about.trim() !== lead ? (
        <p className="max-w-prose text-lg wrap-anywhere whitespace-pre-line">{platform.about}</p>
      ) : null}
      <section aria-labelledby="landing-start" className="flex flex-col gap-6">
        <h2 id="landing-start" className="text-xl font-semibold">
          {m.catalog_landing_start_title()}
        </h2>
        <ol className="grid gap-6 @2xl:grid-cols-3 @2xl:gap-0">
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-4 @2xl:flex-col @2xl:pr-6">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-primary bg-background font-heading text-lg font-semibold tabular-nums"
                >
                  {index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span aria-hidden className="hidden h-0 flex-1 border-t-2 border-dashed border-input @2xl:block" />
                ) : null}
              </div>
              <span className="max-w-xs self-center @2xl:self-start">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="landing-courses" className="flex flex-col gap-6">
        <h2 id="landing-courses" className="text-xl font-semibold">
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
          <CourseGrid courses={courses.data.items} level={3} />
        </ListState>
      </section>
    </section>
  )
}
