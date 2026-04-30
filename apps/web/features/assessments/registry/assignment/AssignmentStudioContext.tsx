'use client';

/**
 * AssignmentStudioContext
 *
 * Shared state for the three assignment studio slots (Outline, Author, Inspector).
 * The Provider fetches assignment + task data once; all three slots read from it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { normalizeAssignmentTasks } from '@/features/assignments/domain';
import type { AssignmentRead, AssignmentTaskRead } from '@/features/assignments/domain';
import {
  useAssignmentByActivity,
  useAssignmentDetail,
  useAssignmentTasks,
} from '@/features/assignments/hooks/useAssignments';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { KindAuthorProps } from '../index';
import ErrorUI from '@/components/Objects/Elements/Error/Error';
import PageLoading from '@components/Objects/Loaders/PageLoading';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface AssignmentStudioContextValue {
  assignmentUuid: string;
  assignment: AssignmentRead;
  tasks: AssignmentTaskRead[];
  selectedTaskUuid: string | null;
  setSelectedTaskUuid: (uuid: string | null) => void;
  refresh: () => Promise<void>;
  isEditable: boolean;
  totalPoints: number;
}

const AssignmentStudioContext = createContext<AssignmentStudioContextValue | null>(null);

export function useAssignmentStudioContext(): AssignmentStudioContextValue {
  const ctx = useContext(AssignmentStudioContext);
  if (!ctx) throw new Error('useAssignmentStudioContext must be used inside AssignmentStudioProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface ProviderProps extends KindAuthorProps {
  children: ReactNode;
}

/**
 * Fetches assignment data by activityUuid, then resolves the assignmentUuid
 * and fetches tasks. Provides context to Outline / Author / Inspector slots.
 */
export function AssignmentStudioProvider({ activityUuid, children }: ProviderProps) {
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '');

  // Step 1: resolve assignment from activity
  const {
    data: assignmentLookup,
    isLoading: isLookupLoading,
    error: lookupError,
  } = useAssignmentByActivity(normalizedActivityUuid);

  const assignmentUuid = assignmentLookup?.assignment_uuid ?? null;
  const canonicalAssignmentUuid = assignmentUuid
    ? assignmentUuid.startsWith('assignment_')
      ? assignmentUuid
      : `assignment_${assignmentUuid}`
    : null;

  // Step 2: load full assignment + tasks once we have the uuid
  const {
    data: assignment,
    isLoading: isAssignmentLoading,
    error: assignmentError,
  } = useAssignmentDetail(canonicalAssignmentUuid);
  const { data: rawTasks, isLoading: isTasksLoading, error: tasksError } = useAssignmentTasks(canonicalAssignmentUuid);

  const tasks = useMemo(() => normalizeAssignmentTasks(rawTasks), [rawTasks]);

  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string | null>(null);

  // Keep selection valid when task list changes
  useEffect(() => {
    if (!selectedTaskUuid && tasks[0]) {
      setSelectedTaskUuid(tasks[0].assignment_task_uuid);
      return;
    }
    if (selectedTaskUuid && tasks.length > 0 && !tasks.some((t) => t.assignment_task_uuid === selectedTaskUuid)) {
      setSelectedTaskUuid(tasks[0]?.assignment_task_uuid ?? null);
    }
  }, [selectedTaskUuid, tasks]);

  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    if (!canonicalAssignmentUuid) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(canonicalAssignmentUuid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.tasks(canonicalAssignmentUuid) }),
    ]);
  }, [canonicalAssignmentUuid, queryClient]);

  const isLoading = isLookupLoading || isAssignmentLoading || isTasksLoading;
  const error = lookupError ?? assignmentError ?? tasksError;

  if (error) return <ErrorUI message="Unable to load assignment studio." />;
  if (isLoading || !assignment || !canonicalAssignmentUuid) return <PageLoading />;

  const isEditable = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
  const totalPoints = tasks.reduce((sum, t) => sum + (t.max_grade_value > 0 ? t.max_grade_value : 0), 0);

  return (
    <AssignmentStudioContext.Provider
      value={{
        assignmentUuid: canonicalAssignmentUuid,
        assignment,
        tasks,
        selectedTaskUuid,
        setSelectedTaskUuid,
        refresh,
        isEditable,
        totalPoints,
      }}
    >
      {children}
    </AssignmentStudioContext.Provider>
  );
}
