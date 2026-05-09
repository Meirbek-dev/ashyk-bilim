import type { Dispatch, SetStateAction } from 'react';
import type { Submission, SubmissionStatus } from '@/features/grading/domain';

export type StatusFilter = SubmissionStatus | 'ALL' | 'NEEDS_GRADING';

export interface ReviewNavigationState {
  selectedIndex: number;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
}

export interface SubmissionListProps {
  submissions: Submission[];
  total: number;
  pages: number;
  page: number;
  activeFilter: StatusFilter;
  search: string;
  sortBy: string;
  isLoading: boolean;
  selectedUuid: string | null;
  selectedUuids: Set<string>;
  onFilterChange: (value: StatusFilter) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onPageChange: Dispatch<SetStateAction<number>>;
  onSelectSubmission: (uuid: string) => void;
  onToggleSelected: (uuid: string, checked: boolean) => void;
}
