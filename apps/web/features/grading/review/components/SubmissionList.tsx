'use client';

import { ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react';

import { getSubmissionDisplayName, needsTeacherAction } from '@/features/grading/domain';
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SubmissionListProps, StatusFilter } from '../types';

export default function SubmissionList({
  submissions,
  total,
  pages,
  page,
  activeFilter,
  search,
  sortBy,
  isLoading,
  selectedUuid,
  selectedUuids,
  onFilterChange,
  onSearchChange,
  onSortChange,
  onPageChange,
  onSelectSubmission,
  onToggleSelected,
}: SubmissionListProps) {
  return (
    <aside className="border-b bg-muted/20 p-4 lg:border-r lg:border-b-0">
      <div className="space-y-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search learner" className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect value={activeFilter} onChange={(event) => onFilterChange(event.target.value as StatusFilter)} aria-label="Status filter">
            <NativeSelectOption value="ALL">All</NativeSelectOption>
            <NativeSelectOption value="NEEDS_GRADING">Needs grading</NativeSelectOption>
            <NativeSelectOption value="PENDING">Pending</NativeSelectOption>
            <NativeSelectOption value="GRADED">Graded</NativeSelectOption>
            <NativeSelectOption value="PUBLISHED">Published</NativeSelectOption>
            <NativeSelectOption value="RETURNED">Returned</NativeSelectOption>
          </NativeSelect>
          <NativeSelect value={sortBy} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort">
            <NativeSelectOption value="submitted_at">Submitted</NativeSelectOption>
            <NativeSelectOption value="final_score">Score</NativeSelectOption>
            <NativeSelectOption value="attempt_number">Attempt</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
        <span>{total} submissions</span>
        <span>{selectedUuids.size} selected</span>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            Loading
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">No submissions found.</div>
        ) : (
          submissions.map((submission) => {
            const selected = submission.submission_uuid === selectedUuid;
            const displayName = getSubmissionDisplayName(submission);
            return (
              <div
                key={submission.submission_uuid}
                className={cn('rounded-md border bg-background p-3 transition hover:bg-muted/60', selected && 'border-primary ring-primary/20 ring-2')}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedUuids.has(submission.submission_uuid)}
                    onCheckedChange={(checked) => onToggleSelected(submission.submission_uuid, checked === true)}
                    aria-label={`Select ${displayName}`}
                  />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelectSubmission(submission.submission_uuid)}>
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    <div className="text-muted-foreground truncate text-xs">{submission.user?.email ?? `User #${submission.user_id}`}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <SubmissionStatusBadge status={submission.status} />
                      {submission.is_late ? <Badge variant="destructive">Late</Badge> : null}
                      {needsTeacherAction(submission.status) ? <Badge variant="warning">Action</Badge> : null}
                    </div>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange((current) => current - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground text-sm">{page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange((current) => current + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
