export type AssignmentStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface AssignmentRead {
  assignment_uuid: string;
  title: string;
  description: string;
  due_at?: string | null;
  status: AssignmentStatus;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  weight: number;
  grading_type: 'NUMERIC' | 'PERCENTAGE';
  course_uuid?: string | null;
  activity_uuid?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AssessmentPolicyLike {
  due_at?: string | null;
}

interface AssessmentReadLike {
  assessment_uuid: string;
  activity_uuid?: string | null;
  course_uuid?: string | null;
  title: string;
  description?: string | null;
  lifecycle: AssignmentStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  weight?: number;
  grading_type?: 'NUMERIC' | 'PERCENTAGE';
  created_at?: string | null;
  updated_at?: string | null;
  assessment_policy?: AssessmentPolicyLike | null;
}

export function assessmentToAssignmentRead(assessment: AssessmentReadLike): AssignmentRead {
  return {
    assignment_uuid: assessment.assessment_uuid,
    title: assessment.title,
    description: assessment.description ?? '',
    due_at: assessment.assessment_policy?.due_at ?? null,
    status: assessment.lifecycle,
    scheduled_publish_at: assessment.scheduled_at ?? null,
    published_at: assessment.published_at ?? null,
    archived_at: assessment.archived_at ?? null,
    weight: assessment.weight ?? 1,
    grading_type: assessment.grading_type ?? 'PERCENTAGE',
    course_uuid: assessment.course_uuid ?? null,
    activity_uuid: assessment.activity_uuid ?? null,
    created_at: assessment.created_at ?? null,
    updated_at: assessment.updated_at ?? null,
  };
}
