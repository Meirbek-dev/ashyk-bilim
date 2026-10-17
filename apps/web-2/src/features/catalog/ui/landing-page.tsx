import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { buttonVariants } from '#/shared/components/button-variants'

import { landingCoursesOptions, platformOptions } from '../queries'
import { CourseGrid } from './course-grid'

// The patchwork beside the title: the newest courses' ornaments, topped up with fixed seeds on an empty platform.
const QUILT = ['ashyq', 'bilim', 'oqu', 'jol']

/** The guest's `/`: what the platform is, how to start, a few courses; the catalog itself is `/courses`. */
export function LandingPage() {
  const { data: platform } = useSuspenseQuery(platformOptions())
  const courses = useSuspenseQuery(landingCoursesOptions())
  const quilt = [...courses.data.items.map(course => course.id), ...QUILT].slice(0, 4)
  const steps = [
    { id: 'browse', body: <Link to="/courses">{m.catalog_landing_step_browse()}</Link> },
    { id: 'signup', body: m.catalog_landing_step_signup() },
    { id: 'learn', body: m.catalog_landing_step_learn() },
  ]
  return (
    <section className="@container flex flex-col gap-16 pb-8">
      <header className="grid items-center gap-10 pt-4 @3xl:grid-cols-2 @3xl:pt-10">
        <div className="flex flex-col items-start gap-5">
          <h1 className="text-display font-semibold wrap-anywhere">{platform.name}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            {platform.description || m.catalog_landing_lead()}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <RouterLink to="/signup" className={buttonVariants({ size: 'lg', className: 'px-5' })}>
              {m.catalog_landing_signup()}
            </RouterLink>
            <RouterLink to="/courses" className={buttonVariants({ size: 'lg', variant: 'outline', className: 'px-5' })}>
              {m.catalog_landing_all_courses()}
            </RouterLink>
          </div>
        </div>
        <div aria-hidden className="grid grid-cols-2 gap-3">
          {quilt.map((seed, index) => (
            <CourseCover key={seed} seed={seed} tone={index} className="aspect-square w-full rounded-xl border" />
          ))}
        </div>
      </header>
      {platform.about ? (
        <p className="max-w-prose text-lg wrap-anywhere whitespace-pre-line">{platform.about}</p>
      ) : null}
      <section aria-labelledby="landing-start" className="flex flex-col gap-6">
        <h2 id="landing-start" className="text-xl font-semibold">
          {m.catalog_landing_start_title()}
        </h2>
        <ol className="grid gap-6 @2xl:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.id} className="flex flex-col gap-2 border-t-2 border-foreground pt-4">
              <span aria-hidden className="font-heading text-2xl font-semibold tabular-nums">
                {index + 1}
              </span>
              <span className="max-w-xs">{step.body}</span>
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
