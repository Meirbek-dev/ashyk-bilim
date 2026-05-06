'use client';

import {
  AlertTriangle,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Keyboard,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import {
  canPublishGrade,
  canReturnSubmission,
  canTeacherEditGrade,
  getReleaseState,
  RELEASE_STATE_LABELS,
} from '@/features/grading/domain';
import type { Submission, TeacherGradeInput } from '@/features/grading/domain';
import { saveGrade } from '@/services/grading/grading';
import { StaleGradeError } from '@/services/grading/errors';
import { useGradingPanel } from '@/hooks/useGradingPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ReviewNavigationState } from '../types';

interface GradeDraft {
  score: string;
  feedback: string;
}

export default function GradeForm({
  submissionUuid,
  assessmentUuid,
  onSaved,
  navigation,
}: {
  submissionUuid: string | null;
  assessmentUuid?: string;
  onSaved: () => Promise<void>;
  navigation: ReviewNavigationState;
}) {
  const { submission, isLoading, mutate } = useGradingPanel(submissionUuid, assessmentUuid);
  const t = useTranslations('Grading.Panel');
  const [draft, setDraft] = useState<GradeDraft>({ score: '', feedback: '' });
  const [isSaving, startSaving] = useTransition();
  const [staleDraft, setStaleDraft] = useState<{ server: Submission; local: GradeDraft } | null>(null);

  useEffect(() => {
    setDraft({
      score:
        submission?.final_score !== null && submission?.final_score !== undefined ? String(submission.final_score) : '',
      feedback: submission?.grading_json?.feedback ?? '',
    });
    setStaleDraft(null);
  }, [submission?.final_score, submission?.grading_json?.feedback, submission?.submission_uuid]);

  const save = (status: TeacherGradeInput['status']) => {
    if (!submission) return;
    const score = Number.parseFloat(draft.score);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      toast.error(t('invalidScore'));
      return;
    }

    const localDraftSnapshot = { ...draft };
    startSaving(async () => {
      try {
        await saveGrade(
          submission.submission_uuid,
          {
            final_score: score,
            feedback: draft.feedback,
            status,
            item_feedback: [],
          },
          submission.version,
          assessmentUuid,
        );
        toast.success(
          status === 'PUBLISHED' ? t('gradePublished') : status === 'RETURNED' ? t('returned') : t('gradeSaved'),
        );
        setStaleDraft(null);
        await Promise.all([mutate(), onSaved()]);
      } catch (error) {
        if (error instanceof StaleGradeError) {
          setStaleDraft({ server: error.serverSubmission, local: localDraftSnapshot });
          await mutate();
        } else {
          toast.error(error instanceof Error ? error.message : t('saveFailed'));
        }
      }
    });
  };

  if (!submissionUuid) {
    return <aside className="text-muted-foreground p-4 text-sm">{t('selectSubmission')}</aside>;
  }

  if (isLoading && !submission) {
    return (
      <aside className="text-muted-foreground flex items-center justify-center p-4 text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loadingSubmission')}
      </aside>
    );
  }

  if (!submission) {
    return <aside className="text-muted-foreground p-4 text-sm">{t('formUnavailable')}</aside>;
  }

  const editable = canTeacherEditGrade(submission.status);
  const canPublishNow = canPublishGrade(submission.status);
  const canReturnNow = canReturnSubmission(submission.status);
  const releaseState =
    'release_state' in submission && submission.release_state
      ? submission.release_state
      : getReleaseState(submission.status);

  return (
    <aside className="space-y-5 p-4 xl:sticky xl:top-0 xl:h-[calc(100vh-96px)] xl:overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('grade')}</h2>
          <KeyboardHint />
        </div>
        <p className="text-muted-foreground text-sm">{t('gradeDescription')}</p>
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>{RELEASE_STATE_LABELS[releaseState]}</AlertTitle>
        <AlertDescription>
          {releaseState === 'HIDDEN'
            ? t('releaseStateHidden')
            : releaseState === 'AWAITING_RELEASE'
              ? t('releaseStateAwaitingRelease')
              : releaseState === 'VISIBLE'
                ? t('releaseStateVisible')
                : t('releaseStateReturned')}
        </AlertDescription>
      </Alert>

      {/* ── OCC stale-grade banner ─────────────────────────────────────── */}
      {staleDraft ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('staleDraftTitle')}</AlertTitle>
          <AlertDescription className="mt-1 space-y-1 text-xs">
            <p>
              {t('staleDraft.serverScoreLabel')} <strong>{staleDraft.server.final_score ?? '—'}</strong>.{' '}
              {t('staleDraft.yourDraftLabel')} <strong>{staleDraft.local.score}</strong>.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => {
                  const s = staleDraft.server;
                  setDraft({
                    score: s.final_score !== null && s.final_score !== undefined ? String(s.final_score) : '',
                    feedback: s.grading_json?.feedback ?? '',
                  });
                  setStaleDraft(null);
                }}
              >
                {t('useServerValues')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => setStaleDraft(null)}
              >
                {t('keepMyDraft')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!navigation.hasPrevious}
          onClick={navigation.goPrevious}
        >
          <ChevronLeft className="size-4" />
          {t('previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!navigation.hasNext}
          onClick={navigation.goNext}
        >
          {t('next')}
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="review-score">{t('finalScore')}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="review-score"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={draft.score}
            disabled={!editable || isSaving}
            onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))}
          />
          <span className="text-muted-foreground text-sm">/100</span>
        </div>
        {submission.auto_score !== null && submission.auto_score !== undefined ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => setDraft((current) => ({ ...current, score: String(submission.auto_score) }))}
          >
            {t('useAutoScore')} {submission.auto_score}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="review-feedback"
          className="flex items-center gap-1.5"
        >
          <MessageSquareText className="size-4" />
          {t('feedback')}
        </Label>
        <Textarea
          id="review-feedback"
          value={draft.feedback}
          disabled={!editable || isSaving}
          className="min-h-36"
          onChange={(event) => setDraft((current) => ({ ...current, feedback: event.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!editable || isSaving}
          onClick={() => save('GRADED')}
        >
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
          {t('saveDraftGrade')}
        </Button>
        <Button
          type="button"
          disabled={!editable || isSaving || !canPublishNow}
          onClick={() => save('PUBLISHED')}
        >
          <Send className="size-4" />
          {t('publishGrade')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!editable || isSaving || !canReturnNow}
          onClick={() => save('RETURNED')}
        >
          <RotateCcw className="size-4" />
          {t('returnForRevision')}
        </Button>
        {!canPublishNow ? <p className="text-muted-foreground text-xs">{t('publishPrerequisite')}</p> : null}
      </div>

      {/* ── Keyboard legend ────────────────────────────────────────────── */}
      <div className="border-t pt-3">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Keyboard className="size-3.5" />
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('keyboardHintNextKey')}</kbd>{' '}
          {t('keyboardHintForward')}
          <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">{t('keyboardHintPrevKey')}</kbd>{' '}
          {t('keyboardHintBackward')}
        </div>
      </div>
    </aside>
  );
}

function KeyboardHint() {
  const t = useTranslations('Grading.Panel');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (globalThis.localStorage.getItem('grading-review-keyboard-hint-seen') === '1') return;
    setOpen(true);
    globalThis.localStorage.setItem('grading-review-keyboard-hint-seen', '1');
    const timeout = globalThis.setTimeout(() => setOpen(false), 4500);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip
        open={open}
        onOpenChange={setOpen}
      >
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
            />
          }
        >
          <Info className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('keyboardHint')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
