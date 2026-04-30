'use client';

import { CheckCircle2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ExamSubmitDialogProps {
  open: boolean;
  totalQuestions: number;
  answeredCount: number;
  isSubmitting: boolean;
  labels: {
    confirmSubmission: string;
    confirmSubmissionMessage: string;
    totalQuestions: string;
    answered: string;
    unanswered: string;
    reviewQuestions: string;
    submitting: string;
    confirmAndSubmit: string;
  };
  onCancel: () => void;
  onSubmit: () => void;
}

export default function ExamSubmitDialog({
  open,
  totalQuestions,
  answeredCount,
  isSubmitting,
  labels,
  onCancel,
  onSubmit,
}: ExamSubmitDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <CheckCircle2 className="size-6 text-green-600" />
          </AlertDialogMedia>
          <AlertDialogTitle>{labels.confirmSubmission}</AlertDialogTitle>
          <AlertDialogDescription>{labels.confirmSubmissionMessage}</AlertDialogDescription>
          <div className="bg-muted rounded-lg border p-4 text-sm">
            <SummaryRow
              label={labels.totalQuestions}
              value={totalQuestions}
            />
            <SummaryRow
              label={labels.answered}
              value={answeredCount}
            />
            <SummaryRow
              label={labels.unanswered}
              value={totalQuestions - answeredCount}
            />
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{labels.reviewQuestions}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onSubmit}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? labels.submitting : labels.confirmAndSubmit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
