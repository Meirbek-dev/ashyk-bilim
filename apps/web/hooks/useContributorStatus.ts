import { courseContributorsQueryOptions } from '@/features/courses/queries/course.query';
import { useSession } from '@/hooks/useSession';
import { queryOptions, useQuery } from '@tanstack/react-query';

export type ContributorStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'INACTIVE';

interface Contributor {
  user_id: number;
  authorship_status: ContributorStatus;
}

export function useContributorStatus(courseUuid: string) {
  const { user: viewer } = useSession();
  const userId = viewer?.id;
  const normalizedCourseUuid = courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`;

  const query = useQuery(
    queryOptions({
      ...courseContributorsQueryOptions(userId ? normalizedCourseUuid : 'disabled'),
      enabled: Boolean(userId),
      select: (response): ContributorStatus => {
        const contributors = Array.isArray(response?.data) ? (response.data as Contributor[]) : [];
        const currentUser = contributors.find((contributor) => contributor.user_id === userId);
        return currentUser?.authorship_status ?? 'NONE';
      },
    }),
  );

  return {
    contributorStatus: query.data ?? 'NONE',
    isLoading: query.isPending,
    refetch: async () => {
      await query.refetch();
    },
  };
}
