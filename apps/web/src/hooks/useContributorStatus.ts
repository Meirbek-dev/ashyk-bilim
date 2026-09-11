export type ContributorStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'INACTIVE'

// Blocked: v2 has no `courses/{id}/contributors` route (QUESTIONS.md
// Q-2026-09-10-3). Until the contract lands nobody is a contributor; asking
// the server only produced a 404 on every course page.
export function useContributorStatus(_courseUuid: string) {
  return {
    contributorStatus: 'NONE' as ContributorStatus,
    isLoading: false,
    refetch: async () => {},
  }
}
