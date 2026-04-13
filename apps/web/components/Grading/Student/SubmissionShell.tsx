'use client';

/**
 * SubmissionShell
 *
 * One student-facing lifecycle wrapper for every assessment type.
 *
 * Handles:
 *   1. Status banner (PENDING / GRADED / PUBLISHED / RETURNED)
 *   2. Full grading result (score + breakdown) after PUBLISHED or RETURNED
 *   3. Submit footer for DRAFT / null states
 *   4. Re-submit footer for RETURNED state
 */

import { CheckCircle2, Clock4, RotateCcw, SendHorizonal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Card, CardContent } from '@components/ui/card';
import { Separator } from '@/components/ui/separator';

import type { AssessmentType, Submission, SubmissionStatus } from '@/types/grading';
import SubmissionStatusBadge from '../SubmissionStatusBadge';
import { useMySubmission } from '@/hooks/useMySubmission';
import SubmissionResult from './SubmissionResult';
import SubmitButton from './SubmitButton';

interface SubmissionShellProps {
  activityId: number;
  assessmentType: AssessmentType;
  children: ReactNode;
  answersPayload?: Record<string, unknown>;
  violationCount?: number;
}

type BannerVariant = 'default' | 'destructive';

interface BannerConfig {
  icon: React.ElementType;
  variant: BannerVariant;
  titleKey: string;
  descKey: string;
  iconClass: string;
}

const STATUS_BANNERS: Partial<Record<SubmissionStatus, BannerConfig>> = {
  PENDING: {
    icon: SendHorizonal,
    variant: 'default',
    titleKey: 'bannerPendingTitle',
    descKey: 'bannerPendingDesc',
    iconClass: 'text-primary',
  },
  GRADED: {
    icon: Clock4,
    variant: 'default',
    titleKey: 'bannerGradedTitle',
    descKey: 'bannerGradedDesc',
    iconClass: 'text-muted-foreground',
  },
  PUBLISHED: {
    icon: CheckCircle2,
    variant: 'default',
    titleKey: 'bannerPublishedTitle',
    descKey: 'bannerPublishedDesc',
    iconClass: 'text-success',
  },
  RETURNED: {
    icon: RotateCcw,
    variant: 'default',
    titleKey: 'bannerReturnedTitle',
    descKey: 'bannerReturnedDesc',
    iconClass: 'text-warning',
  },
};

export default function SubmissionShell({
  activityId,
  assessmentType,
  children,
  answersPayload,
  violationCount,
}: SubmissionShellProps) {
  const t = useTranslations('Grading.SubmissionShell');
  const { submission, isLoading, mutate } = useMySubmission(activityId);

  if (isLoading) return <PageLoading />;

  const status = submission?.status ?? null;
  const bannerConfig = status && status !== 'DRAFT' ? STATUS_BANNERS[status] : null;

  const handleSubmitted = (_updated: Submission) => {
    void mutate();
  };

  // Show result breakdown when grade is visible to the student
  const showResult = (status === 'PUBLISHED' || status === 'RETURNED') && submission;

  // Student can submit when there's no prior submission or it's a DRAFT
  const canSubmit = status === 'DRAFT' || status === null;

  // Student can re-submit when RETURNED
  const canResubmit = status === 'RETURNED';

  return (
    <div className="flex flex-col gap-6">
      {/* Status banner */}
      {bannerConfig && (
        <Alert variant={bannerConfig.variant}>
          <bannerConfig.icon className={`h-4 w-4 ${bannerConfig.iconClass}`} />
          <AlertTitle className="flex items-center gap-2">
            {t(bannerConfig.titleKey)}
            <SubmissionStatusBadge status={status!} />
          </AlertTitle>
          <AlertDescription>{t(bannerConfig.descKey)}</AlertDescription>

          {/* Show score only when published */}
          {status === 'PUBLISHED' && submission !== null && submission.final_score !== null && (
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold">
                {t('score')}: {submission.final_score}/100
              </span>
            </div>
          )}
        </Alert>
      )}

      {/* Assessment content */}
      {children}

      {/* Full grading result breakdown — only when published to student */}
      {showResult && (
        <>
          <Separator />
          <SubmissionResult submission={submission} />
        </>
      )}

      {/* Submit footer */}
      {canSubmit && (
        <>
          <Separator />
          <Card>
            <CardContent className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">{t('readyToSubmit')}</p>
              <SubmitButton
                activityId={activityId}
                assessmentType={assessmentType}
                currentStatus={status}
                answersPayload={answersPayload}
                violationCount={violationCount}
                onSubmitted={handleSubmitted}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Re-submit footer for RETURNED */}
      {canResubmit && (
        <>
          <Separator />
          <Card className="border-secondary/20 bg-secondary/10">
            <CardContent className="flex items-center justify-between">
              <p className="text-warning text-sm">{t('returnedResubmit')}</p>
              <SubmitButton
                activityId={activityId}
                assessmentType={assessmentType}
                currentStatus="RETURNED"
                answersPayload={answersPayload}
                violationCount={violationCount}
                onSubmitted={handleSubmitted}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
