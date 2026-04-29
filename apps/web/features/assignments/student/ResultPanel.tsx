'use client';

import type { Submission } from '@/features/grading/domain';

import SubmissionResult from '@/components/Grading/Student/SubmissionResult';

interface ResultPanelProps {
  submission: Submission;
  onRefresh?: () => void | Promise<void>;
}

export default function StudentResultPanel({ submission, onRefresh }: ResultPanelProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Result</h2>
        <p className="text-sm text-muted-foreground">Released score and feedback.</p>
      </div>
      <SubmissionResult
        submission={submission}
        onRefresh={onRefresh}
      />
    </section>
  );
}
