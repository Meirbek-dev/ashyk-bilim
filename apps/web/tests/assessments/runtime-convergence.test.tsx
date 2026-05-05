/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import AssessmentLayout from '@/features/assessments/shell/AssessmentLayout';
import AssignmentAttemptContent from '@/features/assessments/registry/assignment-attempt';
import { useAttemptShellControls } from '@/features/assessments/shell';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';

const mocks = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useAssessmentSubmissionMock: vi.fn(),
  useAssessmentAttemptPersistenceMock: vi.fn(),
  keepLocalMock: vi.fn(),
  useServerMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiFetch: mocks.apiFetchMock,
  };
});

vi.mock('@/features/assessments/hooks/useAssessment', () => ({
  useAssessmentAttempt: () => ({ vm: null, isLoading: false, error: null }),
}));

vi.mock('@/features/assessments/shared/hooks/useAttemptGuard', () => ({
  useAttemptGuard: () => ({
    fullscreenGateOpen: false,
    fullscreenError: null,
    requestFullscreen: vi.fn(),
    remainingSeconds: null,
    violationCount: 0,
  }),
}));

vi.mock('@/features/assessments/registry', () => ({
  loadKindModule: () =>
    Promise.resolve({
      label: 'Assignment',
      Attempt: DummyAttempt,
    }),
}));

vi.mock('@/features/assessments/hooks/useAssessmentSubmission', () => ({
  useAssessmentSubmission: (...args: unknown[]) => mocks.useAssessmentSubmissionMock(...args),
}));

vi.mock('@/features/assessments/shell/hooks/useAssessmentAttempt', () => ({
  useAssessmentAttempt: (...args: unknown[]) => mocks.useAssessmentAttemptPersistenceMock(...args),
}));

function DummyAttempt() {
  useAttemptShellControls({
    saveState: 'error',
    status: 'DRAFT',
    canSave: false,
    canSubmit: false,
    isSaving: false,
    isSubmitting: false,
    conflict: {
      open: true,
      latestVersion: 7,
      latestSavedAt: '2026-05-05T10:30:00Z',
      localAnswerCount: 3,
      serverAnswerCount: 5,
      onKeepLocalVersion: mocks.keepLocalMock,
      onUseServerVersion: mocks.useServerMock,
    },
  });

  return <div>Attempt content</div>;
}

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

function installLocalStorageMock() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(() => {
        store.clear();
      }),
    },
  });
}

function createAttemptVm(overrides: Partial<AttemptViewModel> = {}): AttemptViewModel {
  const vm = {
    surface: 'ATTEMPT',
    kind: 'TYPE_ASSIGNMENT',
    assessmentUuid: 'assessment_runtime',
    activityUuid: 'activity_runtime',
    title: 'Runtime assessment',
    description: 'Description',
    dueAt: null,
    submissionStatus: null,
    releaseState: 'RETURNED_FOR_REVISION',
    score: { percent: null, source: 'none' },
    policy: {
      dueAt: null,
      maxAttempts: 3,
      timeLimitSeconds: null,
      latePolicy: { penaltyPercent: 0 },
      antiCheat: {
        copyPasteProtection: false,
        tabSwitchDetection: false,
        devtoolsDetection: false,
        rightClickDisabled: false,
        fullscreenEnforced: false,
        violationThreshold: null,
      },
    },
    items: [
      {
        id: 1,
        item_uuid: 'item_assignment',
        order: 1,
        kind: 'OPEN_TEXT',
        title: 'Reflection',
        body: { kind: 'OPEN_TEXT', prompt: 'Explain your answer.' },
        max_score: 5,
        created_at: '2026-05-05T10:00:00Z',
        updated_at: '2026-05-05T10:00:00Z',
      },
    ],
    canEdit: true,
    canSaveDraft: true,
    canSubmit: true,
    isReturnedForRevision: true,
    isResultVisible: true,
    disabledActionReasons: [],
    serverNow: null,
    availableAt: null,
    closesAt: null,
    timeRemainingSeconds: null,
    contentVersion: 1,
    policyVersion: 1,
  } satisfies AttemptViewModel;
  return { ...vm, ...overrides };
}

describe('assessment runtime convergence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorageMock();
    globalThis.localStorage.clear();
    mocks.apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    mocks.useAssessmentAttemptPersistenceMock.mockReturnValue({
      saveAnswers: vi.fn(),
      clearSavedAnswers: vi.fn(),
      getRecoverableData: () => null,
    });
  });

  it('shows the shared draft conflict dialog and allows both resolution paths', async () => {
    renderWithClient(
      <AssessmentLayout
        activityUuid="activity_runtime"
        courseUuid="course_runtime"
        vm={createAttemptVm()}
      />,
    );

    expect(await screen.findByText('Resolve draft conflict')).toBeInTheDocument();
    expect(screen.getByText(/newer draft version \(7\) was saved/i)).toBeInTheDocument();
    expect(screen.getByText(/local draft has 3 answered items/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep my local version' }));
    expect(mocks.keepLocalMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Use latest saved version' }));
    expect(mocks.useServerMock).toHaveBeenCalledTimes(1);
  });

  it('renders returned resubmission entry flow and starts a revision draft', async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mocks.useAssessmentSubmissionMock.mockReturnValue({
      answers: {},
      draft: null,
      submissions: [
        {
          submission_uuid: 'submission_returned',
          status: 'RETURNED',
          final_score: 84,
          grading_json: { feedback: 'Revise the argument and resubmit.' },
          submitted_at: '2026-05-05T09:45:00Z',
          updated_at: '2026-05-05T09:45:00Z',
          created_at: '2026-05-05T09:30:00Z',
          attempt_number: 1,
        },
      ],
      submission: null,
      status: null,
      saveState: 'idle',
      isSaving: false,
      isSubmitting: false,
      save: saveMock,
      submit: vi.fn(),
      setItemAnswer: vi.fn(),
      conflict: null,
    });

    renderWithClient(
      <AssignmentAttemptContent
        courseUuid="course_runtime"
        activityUuid="activity_runtime"
        vm={createAttemptVm()}
      />,
    );

    expect(screen.getByText('Ready to revise')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start revision' })).toBeInTheDocument();
    expect(screen.getByText(/returned for revision/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start revision' }));

    await waitFor(() => {
      expect(mocks.apiFetchMock).toHaveBeenCalledWith(
        'assessments/assessment_runtime/start',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(mocks.toastSuccessMock).toHaveBeenCalledWith('Revision draft created');
  });
});
