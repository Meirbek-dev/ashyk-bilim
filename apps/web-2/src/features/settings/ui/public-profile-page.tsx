import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from '@tanstack/react-router'

import { CourseGrid } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { UserAvatar } from '#/shared/components/user-avatar'

import { shownSections } from '../model/profile-sections'
import { profileCertificatesOptions, publicProfileOptions, userCoursesListOptions } from '../queries'
import { hangingSection } from './hanging-section'
import { ProfileCertificates } from './profile-certificates'
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
  const { data: certificates } = useSuspenseQuery(profileCertificatesOptions(username))
  const empty =
    !user.bio && items.length === 0 && certificates.length === 0 && shownSections(user.profile.sections).length === 0
  return (
    <DetailPage
      cover={
        // The person, large, in the column the sections below hang from.
        <div className="[&_[data-slot=avatar]]:size-40 @3xl:[&_[data-slot=avatar]]:size-48">
          <UserAvatar name={user.display_name} avatarKey={user.avatar_key} size="profile" />
        </div>
      }
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
      {user.bio ? (
        <section aria-label={m.settings_user_about()} className={hangingSection}>
          <h2 className="text-xl font-semibold wrap-break-word">{m.settings_user_about()}</h2>
          <p className="max-w-prose wrap-anywhere whitespace-pre-line">{user.bio}</p>
        </section>
      ) : null}
      {empty ? (
        <p className="max-w-prose py-6 font-heading text-lg text-muted-foreground">{m.settings_user_empty()}</p>
      ) : null}
      {/* A learner makes no courses: the section is there only when there is something in it (or it failed). */}
      {items.length > 0 || courses.error ? (
        <section aria-label={m.settings_user_courses()} className={hangingSection}>
          <h2 className="text-xl font-semibold wrap-break-word">{m.settings_user_courses()}</h2>
          <div className="flex min-w-0 flex-col gap-6">
            <ListState
              pending={false}
              error={courses.error}
              count={items.length}
              filtered={false}
              emptyText={m.settings_user_courses_empty()}
              onRetry={() => void courses.refetch()}
            >
              {/* The same books as the catalog: a teacher's courses read as courses, not as a list of links. */}
              <CourseGrid courses={items} level={3} />
              <ShowMore
                hasMore={courses.hasNextPage}
                pending={courses.isFetchingNextPage}
                onMore={() => void courses.fetchNextPage()}
              />
            </ListState>
          </div>
        </section>
      ) : null}
      <ProfileCertificates certificates={certificates} />
      <PublicSections sections={user.profile.sections} />
    </DetailPage>
  )
}
