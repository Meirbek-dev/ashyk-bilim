import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { UserAvatar } from '#/shared/components/user-avatar'

import { publicProfileOptions, userCoursesListOptions } from '../queries'
import { PublicSections } from './public-sections'

/**
 * /users/$username: who the person is (photo or initials beside what they wrote about themselves), the courses they
 * make or teach when there are any, their profile sections; one sentence when the profile is empty, and "Edit
 * profile" on one's own (B-SET-19).
 */
export function PublicProfilePage() {
  const { username } = useParams({ from: '/_public/users/$username' })
  const { data: user } = useSuspenseQuery(publicProfileOptions(username))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const courses = useSuspenseInfiniteQuery(userCoursesListOptions(username))
  const items = courses.data.pages.flatMap(page => page.items)
  const empty = !user.bio && items.length === 0 && user.profile.sections.length === 0
  return (
    <DetailPage
      title={user.display_name}
      meta={`@${user.username}`}
      primaryAction={
        session?.user_id === user.id ? (
          <RouterLink to="/settings/profile" className={buttonVariants({ variant: 'outline' })}>
            {m.settings_user_edit()}
          </RouterLink>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-gutter @2xl:flex-row @2xl:items-start">
        <UserAvatar name={user.display_name} avatarKey={user.avatar_key} size="profile" />
        {user.bio ? (
          <section aria-label={m.settings_user_about()} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{m.settings_user_about()}</h2>
            <p className="max-w-prose wrap-anywhere whitespace-pre-line">{user.bio}</p>
          </section>
        ) : null}
        {empty ? <p className="text-muted-foreground @2xl:self-center">{m.settings_user_empty()}</p> : null}
      </div>
      {/* A learner makes no courses: the section is there only when there is something in it (or it failed). */}
      {items.length > 0 || courses.error ? (
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
      ) : null}
      <PublicSections sections={user.profile.sections} />
    </DetailPage>
  )
}
