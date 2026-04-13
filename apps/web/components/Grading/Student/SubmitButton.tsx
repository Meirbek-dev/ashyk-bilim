'use client';

/**
 * SubmitButton
 *
 * Unified "Submit for Grading" button for all assessment types.
 *
 * For timed assessments (QUIZ, EXAM), calls startSubmission first to
 * create a DRAFT with a server-stamped start time before submitting answers.
 * This prevents clients from falsifying the start timestamp.
 *
 * For ASSIGNMENT types, skips startSubmission (no timed start needed).
 */

import { useState, useCallback } from 'react';
import { SendHorizonal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import type { AssessmentType, Submission, SubmissionStatus } from '@/types/grading';
import { startSubmission, submitAssessment } from '@services/grading/grading';

interface SubmitButtonProps {
  activityId: number;
  assessmentType: AssessmentType;
  /** Current submission status — used to disable the button when not needed */
  currentStatus?: SubmissionStatus | null;
  /** Answers payload; omit for manual-graded types (ASSIGNMENT) */
  answersPayload?: Record<string, unknown>;
  violationCount?: number;
  onSubmitted?: (submission: Submission) => void;
  className?: string;
}

/** Assessment types that require a server-stamped start before submission */
const TIMED_ASSESSMENT_TYPES = new Set<AssessmentType>(['QUIZ', 'EXAM']);

const NON_SUBMITTABLE_STATUSES = new Set<SubmissionStatus>(['PENDING', 'GRADED', 'PUBLISHED']);

export default function SubmitButton({
  activityId,
  assessmentType,
  currentStatus,
  answersPayload = {},
  violationCount = 0,
  onSubmitted,
  className,
}: SubmitButtonProps) {
  const t = useTranslations('Grading.SubmitButton');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const alreadySubmitted = currentStatus ? NON_SUBMITTABLE_STATUSES.has(currentStatus) : false;

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      // For timed assessments, ensure a DRAFT exists with a server-stamped start time.
      // startSubmission is idempotent — it returns the existing DRAFT if one already exists.
      if (TIMED_ASSESSMENT_TYPES.has(assessmentType)) {
        await startSubmission(activityId, assessmentType);
      }

      const submission = await submitAssessment(
        activityId,
        assessmentType,
        answersPayload,

        violationCount,
      );
      toast.success(t('submitted'));
      onSubmitted?.(submission);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [activityId, assessmentType, answersPayload, violationCount, onSubmitted, t]);

  if (alreadySubmitted) {
    return (
      <Button
        variant="outline"
        disabled
        className={className}
      >
        <SendHorizonal className="mr-2 h-4 w-4" />
        {t('alreadySubmitted')}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            disabled={isSubmitting}
            className={className}
          >
            <SendHorizonal className="mr-2 h-4 w-4" />
            {isSubmitting ? t('submitting') : t('submitForGrading')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>{t('confirmSubmit')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
