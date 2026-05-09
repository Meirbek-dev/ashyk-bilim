/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AssessmentOperationsPanel from '@/components/Dashboard/Analytics/AssessmentOperationsPanel';
import type { TeacherAssessmentDetailResponse } from '@/types/analytics';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en-US',
}));

const createObjectUrlMock = vi.fn(() => 'blob:audit-history');
const revokeObjectUrlMock = vi.fn();

Object.defineProperty(globalThis, 'URL', {
  value: {
    ...globalThis.URL,
    createObjectURL: createObjectUrlMock,
    revokeObjectURL: revokeObjectUrlMock,
  },
  writable: true,
});

function createDetail(overrides: Partial<TeacherAssessmentDetailResponse> = {}): TeacherAssessmentDetailResponse {
  return {
    course_id: overrides.course_id ?? 1,
    generated_at: '2026-05-05T12:00:00Z',
    assessment_type: 'assignment',
    assessment_id: 42,
    title: 'Operational analytics',
    summary: {
      eligible_learners: 24,
      submitted_learners: 18,
      submission_rate: 75,
      pass_rate: 68,
      median_score: 74,
      avg_attempts: 1.4,
      grading_latency_hours_p50: 18,
    },
    pass_threshold: 60,
    pass_threshold_bucket_label: '60-69',
    score_distribution: [],
    attempt_distribution: [],
    question_breakdown: [],
    common_failures: [],
    learner_rows: [],
    diagnostics: {
      manual_grading_required: true,
      total_attempt_records: 18,
      draft_attempts: 2,
      awaiting_grading: 4,
      graded_not_released: 3,
      returned_for_resubmission: 1,
      released: 8,
      late_submissions: 2,
      stale_backlog: 2,
      suspicious_attempts: 1,
      missing_scores: 4,
      note: 'Assignments use canonical submission states and grading ledger history.',
    },
    audit_history: [
      {
        id: 'bulk-action-1',
        source: 'bulk_action',
        action: 'release_grades',
        actor_user_id: 1,
        actor_display_name: 'Teacher Analytics',
        occurred_at: '2026-05-05T10:00:00Z',
        status: 'completed',
        summary: 'Release Grades for 8 learners',
        affected_count: 8,
        submission_id: null,
      },
    ],
    slo: {
      status: 'warning',
      target_hours: 24,
      observed_p50_hours: 18,
      observed_p90_hours: 31,
      backlog_count: 4,
      overdue_backlog_count: 2,
      note: 'Backlog is approaching the release target for manual grading.',
    },
    migration: {
      is_canonical: true,
      canonical_row_count: 18,
      cutover_ready: true,
      compatibility_mode: 'canonical',
      note: 'Assessment analytics detail is backed by canonical submission and grading records.',
    },
    support: {
      analytics_mode: 'live',
      scoped_eligible_learners: 24,
      scoped_visible_learners: 18,
      scoped_cohort_count: 2,
      cohort_filter_applied: false,
      audit_event_count: 1,
      cutover_blockers: [],
      alerts: [
        {
          code: 'grading_slo_breached',
          severity: 'critical',
          summary: 'Grading latency is outside the current service target.',
        },
      ],
      note: 'Support follow-up is recommended for the active alerts.',
    },
    cohort_analytics: [
      {
        cohort_id: 10,
        cohort_name: 'Alpha Cohort',
        eligible_learners: 12,
        submitted_learners: 10,
        submission_rate: 83.3,
        pass_rate: 70,
        awaiting_grading: 2,
        returned_for_resubmission: 1,
        released_learners: 5,
        avg_attempts: 1.5,
        median_score: 76,
      },
    ],
    item_analytics: [
      {
        item_key: 'awaiting_grading',
        item_label: 'Awaiting teacher grading',
        item_type: 'workflow',
        population_count: 18,
        impacted_count: 4,
        impact_rate: 22.2,
        signal: 'critical',
        note: 'Manual review is still pending for these learners.',
      },
      {
        item_key: 'q1',
        item_label: 'Question 1',
        item_type: 'question',
        population_count: 18,
        impacted_count: 9,
        impact_rate: 50,
        signal: 'watch',
        note: 'Accuracy 50.0%',
      },
    ],
    ...overrides,
  };
}

describe('AssessmentOperationsPanel', () => {
  it('renders diagnostics, slo, migration, and audit details', () => {
    render(<AssessmentOperationsPanel detail={createDetail()} />);

    expect(screen.getByText('pages.assessmentOpsTitle')).toBeInTheDocument();
    expect(
      screen.getByText('Assignments use canonical submission states and grading ledger history.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Backlog is approaching the release target for manual grading.')).toBeInTheDocument();
    expect(
      screen.getByText('Assessment analytics detail is backed by canonical submission and grading records.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Support follow-up is recommended for the active alerts.')).toBeInTheDocument();
    expect(screen.getByText('Grading latency is outside the current service target.')).toBeInTheDocument();
    expect(screen.getByText('Alpha Cohort')).toBeInTheDocument();
    expect(screen.getByText('Awaiting teacher grading')).toBeInTheDocument();
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Release Grades for 8 learners')).toBeInTheDocument();
    expect(screen.getByText('Teacher Analytics')).toBeInTheDocument();
    expect(screen.getByText('pages.assessmentOpsAuditRowCount')).toBeInTheDocument();
    expect(screen.getByText('pages.assessmentSupportBlockersEmpty')).toBeInTheDocument();
  });

  it('shows the empty audit state when no operational events are available', () => {
    render(
      <AssessmentOperationsPanel
        detail={createDetail({
          audit_history: [],
          migration: {
            is_canonical: true,
            canonical_row_count: 18,
            cutover_ready: true,
            compatibility_mode: 'canonical',
            note: 'Assignments are reading only canonical submission rows.',
          },
          slo: {
            status: 'healthy',
            target_hours: 24,
            observed_p50_hours: 8,
            observed_p90_hours: 12,
            backlog_count: 0,
            overdue_backlog_count: 0,
            note: 'Current grading latency is within target.',
          },
          support: {
            analytics_mode: 'live',
            scoped_eligible_learners: 18,
            scoped_visible_learners: 18,
            scoped_cohort_count: 0,
            cohort_filter_applied: false,
            audit_event_count: 0,
            cutover_blockers: [],
            alerts: [],
            note: 'Support diagnostics are within the current operational envelope.',
          },
          cohort_analytics: [],
          item_analytics: [],
        })}
      />,
    );

    expect(screen.getByText('pages.assessmentOpsAuditEmpty')).toBeInTheDocument();
    expect(screen.getByText('Assignments are reading only canonical submission rows.')).toBeInTheDocument();
    expect(screen.getByText('Current grading latency is within target.')).toBeInTheDocument();
    expect(screen.getByText('Support diagnostics are within the current operational envelope.')).toBeInTheDocument();
    expect(screen.getByText('pages.assessmentSupportAlertsEmpty')).toBeInTheDocument();
    expect(screen.getByText('pages.assessmentSupportBlockersEmpty')).toBeInTheDocument();
    expect(screen.getByText('pages.assessmentItemEmpty')).toBeInTheDocument();
    expect(screen.getByText('pages.assessmentCohortEmpty')).toBeInTheDocument();
  });

  it('filters and exports audit history from the current payload', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <AssessmentOperationsPanel
        detail={createDetail({
          audit_history: [
            {
              id: 'bulk-action-1',
              source: 'bulk_action',
              action: 'release_grades',
              actor_user_id: 1,
              actor_display_name: 'Teacher Analytics',
              occurred_at: '2026-05-05T10:00:00Z',
              status: 'completed',
              summary: 'Release Grades for 8 learners',
              affected_count: 8,
              submission_id: null,
            },
            {
              id: 'grading-entry-1',
              source: 'grading_entry',
              action: 'save_feedback',
              actor_user_id: 1,
              actor_display_name: 'Teacher Analytics',
              occurred_at: '2026-05-05T09:00:00Z',
              status: 'pending',
              summary: 'Saved draft feedback for Dana',
              affected_count: 1,
              submission_id: 4,
            },
          ],
        })}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('pages.assessmentOpsAuditSearchPlaceholder'), {
      target: { value: 'draft' },
    });

    expect(screen.getByText('Saved draft feedback for Dana')).toBeInTheDocument();
    expect(screen.queryByText('Release Grades for 8 learners')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('pages.assessmentOpsAuditExport'));

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });
});
