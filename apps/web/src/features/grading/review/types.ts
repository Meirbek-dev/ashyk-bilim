import type { Dispatch, SetStateAction } from 'react'
import type { Submission, SubmissionStatus } from '@/features/grading/domain'

export type StatusFilter = SubmissionStatus | 'ALL' | 'NEEDS_GRADING' | 'AWAITING_RELEASE'

/** The filters the review list offers (its select options). */
const STATUS_FILTERS = new Set<string>([
  'ALL',
  'NEEDS_GRADING',
  'AWAITING_RELEASE',
  'PENDING',
  'GRADED',
  'PUBLISHED',
  'RETURNED',
])

/** UX-298: a hand-edited `?filter=` the list does not offer is no filter, not a 422 and an empty list. */
export function parseStatusFilter(value: string | null | undefined): StatusFilter | null {
  return value && STATUS_FILTERS.has(value) ? (value as StatusFilter) : null
}

export interface ReviewNavigationState {
  selectedIndex: number
  hasPrevious: boolean
  hasNext: boolean
  goPrevious: () => void
  goNext: () => void
}

export interface SubmissionListProps {
  submissions: Submission[]
  total: number
  /** `total` is a lower bound: the queue continues past the last page. */
  hasMore?: boolean
  pages: number
  page: number
  activeFilter: StatusFilter
  search: string
  sortBy: string
  isLoading: boolean
  selectedUuid: string | null
  selectedUuids: Set<string>
  onFilterChange: (value: StatusFilter) => void
  onSearchChange: (value: string) => void
  onSortChange: (value: string) => void
  onPageChange: Dispatch<SetStateAction<number>>
  onSelectSubmission: (uuid: string) => void
  onToggleSelected: (uuid: string, checked: boolean) => void
}
