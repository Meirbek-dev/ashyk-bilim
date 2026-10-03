import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'
import { ShowMore } from '#/shared/ui/show-more'
import { DetailPage } from '#/shared/ui/templates/detail-page'

import { contentUrl } from '../model/settings'
import { publicProfileOptions, userCoursesListOptions } from '../queries'
import { PublicSections } from './public-sections'

/** /users/$username: who the person is, what they wrote about themselves, and the courses they make or teach. */
export function PublicProfilePage() {
  const { username } = useParams({ from: '/_public/users/$username' })
  const { data: user } = useSuspenseQuery(publicProfileOptions(username))
  const courses = useSuspenseInfiniteQuery(userCoursesListOptions(username))
  const items = courses.data.pages.flatMap(page => page.items)
  return (
    <DetailPage title={user.display_name} meta={`@${user.username}`}>
      {user.avatar_key ? (
        <img src={contentUrl(user.avatar_key)} alt="" className="size-24 rounded-full bg-muted object-cover" />
      ) : null}
      {user.bio ? (
        <section aria-label={m.settings_user_about()} className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{m.settings_user_about()}</h2>
          <p className="max-w-prose wrap-anywhere whitespace-pre-line">{user.bio}</p>
        </section>
      ) : null}
      <section aria-label={m.settings_user_courses()} className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{m.settings_user_courses()}</h2>
        <ListState
          pending={false}
          error={courses.error}
          count={items.length}
          filtered={false}
          emptyText={m.settings_user_courses_empty()}
          onRetry={() => void courses.refetch()}
        >
          <DataList items={items} getKey={course => course.id}>
            {course => (
              <>
                <h3 className="font-medium wrap-anywhere">
                  <Link to="/courses/$courseId" params={{ courseId: course.id }}>
                    {course.name}
                  </Link>
                </h3>
                {course.description ? <p className="text-sm text-muted-foreground">{course.description}</p> : null}
              </>
            )}
          </DataList>
          <ShowMore
            hasMore={courses.hasNextPage}
            pending={courses.isFetchingNextPage}
            onMore={() => void courses.fetchNextPage()}
          />
        </ListState>
      </section>
      <PublicSections sections={user.profile.sections} />
    </DetailPage>
  )
}
