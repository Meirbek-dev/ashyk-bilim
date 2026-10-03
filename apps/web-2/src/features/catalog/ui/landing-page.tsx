import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'
import { DetailPage } from '#/shared/ui/templates/detail-page'

import { landingCoursesOptions, platformOptions } from '../queries'
import { CourseItem } from './course-item'

/** The guest's `/`: what the platform is, how to start, a few courses; the catalog itself is `/courses`. */
export function LandingPage() {
  const { data: platform } = useSuspenseQuery(platformOptions())
  const courses = useSuspenseQuery(landingCoursesOptions())
  return (
    <DetailPage
      title={platform.name}
      meta={platform.description || m.catalog_landing_lead()}
      primaryAction={
        <Link to="/signup" variant="primary">
          {m.catalog_landing_signup()}
        </Link>
      }
    >
      {platform.about ? <p className="max-w-prose wrap-anywhere whitespace-pre-line">{platform.about}</p> : null}
      <h2 className="text-xl font-semibold">{m.catalog_landing_start_title()}</h2>
      <ol className="flex max-w-prose list-decimal flex-col gap-2 pl-6">
        <li>
          <Link to="/courses">{m.catalog_landing_step_browse()}</Link>
        </li>
        <li>{m.catalog_landing_step_signup()}</li>
        <li>{m.catalog_landing_step_learn()}</li>
      </ol>
      <h2 className="text-xl font-semibold">{m.catalog_landing_courses_title()}</h2>
      <ListState
        pending={false}
        error={courses.error}
        count={courses.data.items.length}
        filtered={false}
        emptyText={m.catalog_courses_empty()}
        onRetry={() => void courses.refetch()}
      >
        <DataList items={courses.data.items} getKey={course => course.id}>
          {course => <CourseItem course={course} level={3} />}
        </DataList>
        <div>
          <Link to="/courses" variant="outline">
            {m.catalog_landing_all_courses()}
          </Link>
        </div>
      </ListState>
    </DetailPage>
  )
}
