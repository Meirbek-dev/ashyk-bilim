'use client';

/**
 * ReadinessPanel — Surfaces publish readiness issues from the backend.
 *
 * Calls GET /assessments/{uuid}/readiness and displays any blocking issues
 * that prevent the assessment from being published.
 */

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ReadinessIssue {
  code: string;
  message: string;
  item_uuid?: string | null;
}

interface ReadinessPanelProps {
  isReady: boolean;
  issues: ReadinessIssue[];
  isLoading?: boolean;
}

export default function ReadinessPanel({ isReady, issues, isLoading }: ReadinessPanelProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse rounded-md border p-3">
        <div className="bg-muted h-4 w-32 rounded" />
      </div>
    );
  }

  if (isReady) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CheckCircle2 className="size-4 text-green-600" />
        <AlertTitle className="text-green-800 dark:text-green-200">Ready to publish</AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
      <AlertCircle className="size-4 text-red-600" />
      <AlertTitle className="text-red-800 dark:text-red-200">Not ready to publish</AlertTitle>
      <AlertDescription className="mt-2 space-y-1">
        {issues.map((issue, idx) => (
          <p
            key={idx}
            className="text-xs text-red-700 dark:text-red-300"
          >
            • {issue.message}
          </p>
        ))}
      </AlertDescription>
    </Alert>
  );
}
