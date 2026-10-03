import { infiniteQueryOptions, queryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  changePasswordMutation,
  currentSessionQueryKey,
  dashboardOptions,
  dashboardQueryKey,
  listSessionsOptions,
  listSessionsQueryKey,
  myProfileQueryKey,
  publicProfileOptions as generatedPublicProfileOptions,
  revokeSessionMutation,
  totpEnrollMutation,
  totpRemoveMutation,
  totpVerifyMutation,
  updatePreferencesMutation,
  userCoursesInfiniteQueryKey,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { myProfile, updateMyProfile, userCourses } from '#/shared/api/gen/sdk.gen'
import type {
  CourseId,
  CoursePage,
  Dashboard,
  Profile,
  SessionInfo,
  SessionSummary,
  UpdateProfileRequest,
  UserProfile,
} from '#/shared/api/gen/types.gen'
import { upload } from '#/shared/api/upload'

/** The profile with the version of its builder document, which the API sends only as the `ETag` (SPEC). */
export type VersionedProfile = UserProfile & { version: number | null }

const etagVersion = (response: Response): number | null => {
  const tag = response.headers.get('etag')?.replaceAll('"', '')
  return tag && /^\d+$/.test(tag) ? Number(tag) : null
}

export const profileOptions = () =>
  queryOptions({
    queryKey: myProfileQueryKey(),
    queryFn: async ({ signal }): Promise<VersionedProfile> => {
      const { data, response } = await myProfile({ signal, throwOnError: true })
      return { ...data, version: etagVersion(response) }
    },
  })

/** The shell reads the session: a change the answer already carries goes straight into it, without a refetch. */
const updateSession = (queryClient: QueryClient, change: (session: SessionInfo) => SessionInfo) =>
  queryClient.setQueryData(currentSessionQueryKey(), (session: SessionInfo | null | undefined) =>
    session ? change(session) : session,
  )

type ProfileWrite = { body: UpdateProfileRequest; version?: number | null }

/** Every profile write: the answer (with its new ETag) replaces the cache; the shell's session shows the change. */
export const updateProfileOptions = (queryClient: QueryClient) => ({
  mutationFn: async ({ body, version }: ProfileWrite): Promise<VersionedProfile> => {
    const headers = version === undefined || version === null ? {} : { 'If-Match': version }
    const { data, response } = await updateMyProfile({ body, headers, throwOnError: true })
    return { ...data, version: etagVersion(response) }
  },
  onSuccess: (profile: VersionedProfile) => {
    queryClient.setQueryData(myProfileQueryKey(), profile)
    const { display_name, avatar_key, locale, theme } = profile
    updateSession(queryClient, session => ({
      ...session,
      user: { ...session.user, display_name, avatar_key, locale, theme },
    }))
  },
})

/** Upload the file as an `avatar`, then claim it; null removes the photo. */
export const avatarOptions = (queryClient: QueryClient) => {
  const update = updateProfileOptions(queryClient)
  return {
    ...update,
    mutationFn: async (file: File | null) => {
      const avatar = file ? await upload(file, 'avatar') : null
      return update.mutationFn({ body: { avatar_upload_id: avatar?.id ?? null } })
    },
  }
}

/** The server ends every other session on a password change: only this one stays in the list. */
export const changePasswordOptions = (queryClient: QueryClient) => ({
  ...changePasswordMutation(),
  onSuccess: () =>
    queryClient.setQueryData(listSessionsQueryKey(), (list: SessionSummary[] | undefined) =>
      list?.filter(session => session.current),
    ),
})

export const sessionsOptions = () => listSessionsOptions()

/** Drops the session from the cached list: 204 has no body, and a 404 means it had already ended. */
export const revokeSessionOptions = (queryClient: QueryClient) => {
  const drop = (handle: string) =>
    queryClient.setQueryData(listSessionsQueryKey(), (list: SessionSummary[] | undefined) =>
      list?.filter(session => session.handle !== handle),
    )
  return {
    ...revokeSessionMutation(),
    onSuccess: (_: unknown, { path }: { path: { handle: string } }) => drop(path.handle),
    onError: (error: unknown, { path }: { path: { handle: string } }) => {
      if (error instanceof ApiError && error.status === 404) drop(path.handle)
    },
  }
}

const setMfa = (queryClient: QueryClient, enabled: boolean) => {
  queryClient.setQueryData(myProfileQueryKey(), (profile: VersionedProfile | undefined) =>
    profile ? { ...profile, mfa_enabled: enabled } : profile,
  )
  updateSession(queryClient, session => ({ ...session, mfa_enabled: enabled }))
}

/** A 409 means another tab enrolled or finished first (UX-110, UX-118): read the profile again. */
export const totpEnrollOptions = (queryClient: QueryClient) => ({
  ...totpEnrollMutation(),
  onError: (error: unknown) => {
    if (error instanceof ApiError && error.status === 409)
      void queryClient.refetchQueries({ queryKey: myProfileQueryKey() })
  },
})

export const totpVerifyOptions = (queryClient: QueryClient) => ({
  ...totpVerifyMutation(),
  onSuccess: () => setMfa(queryClient, true),
})

export const totpRemoveOptions = (queryClient: QueryClient) => ({
  ...totpRemoveMutation(),
  onSuccess: () => setMfa(queryClient, false),
})

/** The gamification profile carries the preferences (no narrower read operation exists). */
export const gamificationOptions = () => dashboardOptions()

export const updatePreferencesOptions = (queryClient: QueryClient) => ({
  ...updatePreferencesMutation(),
  onSuccess: (profile: Profile) =>
    queryClient.setQueryData(dashboardQueryKey(), (dashboard: Dashboard | undefined) =>
      dashboard ? { ...dashboard, profile } : dashboard,
    ),
})

export const publicProfileOptions = (username: string) => generatedPublicProfileOptions({ path: { username } })

/** Route loader of /users/$username: an unknown user is "not found". */
export async function ensurePublicProfile(queryClient: QueryClient, username: string) {
  const [profile] = await Promise.all([
    queryClient.ensureQueryData(publicProfileOptions(username)),
    queryClient.ensureInfiniteQueryData(userCoursesListOptions(username)),
  ]).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) throw notFound()
    throw error
  })
  return profile
}

const COURSES_PAGE = 20

// Composed by hand like collectionsListOptions: the generated infinite options type the queryFn as skippable.
export const userCoursesListOptions = (username: string) => {
  const options = { path: { username }, query: { limit: COURSES_PAGE } }
  return infiniteQueryOptions<
    CoursePage,
    ApiError,
    InfiniteData<CoursePage>,
    ReturnType<typeof userCoursesInfiniteQueryKey>,
    CourseId | undefined
  >({
    queryKey: userCoursesInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await userCourses({
        path: options.path,
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}
