'use client';

import { AlertCircle, CheckCircle, Clock, FileText, InfinityIcon, ShieldAlert, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import type { AttemptHistoryItem } from '@/features/assessments/shared/AttemptHistoryList';
import type { PolicyView } from '@/features/assessments/domain/policy';
import { apiFetch } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ExamStartAttempt {
  submission_uuid?: string;
  status?: string;
  submitted_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  final_score?: number | null;
}

interface ExamStartPanelProps {
  assessmentUuid: string;
  title: string;
  description?: string | null;
  questionCount: number;
  userAttempts: ExamStartAttempt[];
  policy: PolicyView;
  attemptLimit?: number | null;
  timeLimitMinutes?: number | null;
  isTeacher?: boolean;
  onStartExam: (attempt: ExamStartAttempt) => void;
  onReviewAttempt?: (attempt: ExamStartAttempt) => void;
}

export default function ExamStartPanel({
  assessmentUuid,
  title,
  description,
  questionCount,
  userAttempts,
  policy,
  attemptLimit = null,
  timeLimitMinutes = null,
  isTeacher = false,
  onStartExam,
  onReviewAttempt,
}: ExamStartPanelProps) {
  const t = useTranslations('Activities.ExamActivity');
  const [isStarting, setIsStarting] = useState(false);
  const remainingAttempts = isTeacher || !attemptLimit ? null : Math.max(attemptLimit - userAttempts.length, 0);
  const canTakeExam = isTeacher || !attemptLimit || attemptLimit === 0 || userAttempts.length < attemptLimit;
  const { antiCheat } = policy;
  const hasAntiCheatWarning =
    antiCheat.tabSwitchDetection || antiCheat.copyPasteProtection || antiCheat.devtoolsDetection;

  const historyItems: AttemptHistoryItem[] = userAttempts.map((attempt, index) => ({
    id: attempt.submission_uuid ?? index,
    label: t('attemptNumber', { number: userAttempts.length - index }),
    submittedAt: attempt.submitted_at ?? attempt.updated_at ?? attempt.created_at ?? null,
    scoreLabel: typeof attempt.final_score === 'number' ? `${Math.round(attempt.final_score)}%` : null,
    metaLabel: attempt.status ?? null,
    onReview: onReviewAttempt ? () => onReviewAttempt(attempt) : undefined,
  }));

  const handleStartExam = async () => {
    if (!canTakeExam) {
      toast.error(t('noAttemptsRemaining'));
      return;
    }
    setIsStarting(true);
    try {
      const response = await apiFetch(`assessments/${assessmentUuid}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to start exam');
      }
      const attempt = (await response.json()) as ExamStartAttempt;
      toast.success(t('examStarted'));
      onStartExam(attempt);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errorStartingExam'));
      setIsStarting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoTile
              icon={FileText}
              label={t('totalQuestions')}
              value={String(questionCount)}
            />
            <InfoTile
              icon={Clock}
              label={t('timeLimit')}
              value={timeLimitMinutes ? t('minutes', { count: timeLimitMinutes }) : t('unlimited')}
            />
            <InfoTile
              icon={isTeacher ? InfinityIcon : Users}
              label={isTeacher ? t('teacherPreview') : t('attemptsRemaining')}
              value={isTeacher || remainingAttempts === null ? t('unlimited') : String(remainingAttempts)}
            />
          </div>

          <div className="bg-muted/30 rounded-md border p-4">
            <h3 className="mb-3 text-sm font-semibold">{t('instructions')}</h3>
            <ul className="space-y-2 text-sm">
              <Instruction
                icon={CheckCircle}
                label={t('instruction1')}
              />
              {timeLimitMinutes ? (
                <Instruction
                  icon={CheckCircle}
                  label={t('instruction3', { minutes: timeLimitMinutes })}
                />
              ) : null}
              <Instruction
                icon={AlertCircle}
                label={t('instruction2')}
              />
              {antiCheat.tabSwitchDetection ? (
                <Instruction
                  icon={AlertCircle}
                  label={t('instruction4')}
                />
              ) : null}
              {antiCheat.copyPasteProtection ? (
                <Instruction
                  icon={AlertCircle}
                  label={t('instruction5')}
                />
              ) : null}
            </ul>
          </div>

          {hasAntiCheatWarning ? (
            <Alert className="border-red-200 bg-red-50/80 text-red-900">
              <ShieldAlert className="size-4" />
              <AlertTitle>{t('antiCheatingEnabled')}</AlertTitle>
              <AlertDescription>
                {t('antiCheatingDescription', { threshold: antiCheat.violationThreshold || t('notSet') })}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('readyToStart')}</CardTitle>
            <CardDescription>{t('readyToStartSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              size="lg"
              disabled={!canTakeExam || isStarting}
              onClick={handleStartExam}
            >
              {isStarting ? t('starting') : t('startExam')}
            </Button>
            {!canTakeExam ? <p className="text-muted-foreground mt-2 text-sm">{t('noAttemptsRemaining')}</p> : null}
          </CardContent>
        </Card>
        <AttemptHistoryList
          items={historyItems}
          title={t('previousAttempts')}
        />
      </aside>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <Icon className="text-muted-foreground mb-2 size-4" />
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Instruction({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <li className="flex gap-2">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{label}</span>
    </li>
  );
}
