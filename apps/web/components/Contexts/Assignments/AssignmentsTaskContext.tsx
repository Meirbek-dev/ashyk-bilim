'use client';

import type { ReactNode } from 'react';
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface AssignmentTaskData {
  assignment_task_uuid?: string;
  assignment_type?: string;
  title?: string;
  description?: string;
  hint?: string | null;
  max_grade_value?: number;
  reference_file?: string | null;
  contents?: {
    questions?: unknown[];
    settings?: unknown;
  };
  [key: string]: unknown;
}

interface AssignmentsTaskStore {
  /** The full task object currently open in the editor (empty object = none). */
  assignmentTask: AssignmentTaskData;

  /** UUID of the task currently selected in the sidebar task list. */
  selectedAssignmentTaskUUID: string | null;

  /**
   * Monotonically-increasing counter.  Increment via `reload()` to signal
   * that the task list should be re-fetched.
   */
  reloadKey: number;

  setAssignmentTask: (task: AssignmentTaskData) => void;
  setSelectedTaskUUID: (uuid: string | null) => void;
  reload: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAssignmentsTaskStore = create<AssignmentsTaskStore>((set) => ({
  assignmentTask: {},
  selectedAssignmentTaskUUID: null,
  reloadKey: 0,

  setAssignmentTask: (task) => set({ assignmentTask: task }),
  setSelectedTaskUUID: (uuid) => set({ selectedAssignmentTaskUUID: uuid }),
  reload: () => set((s) => ({ reloadKey: s.reloadKey + 1 })),
}));

// ---------------------------------------------------------------------------
// Provider (pass-through — kept for JSX compatibility)
// ---------------------------------------------------------------------------

export const AssignmentsTaskProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
