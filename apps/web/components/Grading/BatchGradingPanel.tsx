'use client';

import { BookOpenCheck, ChevronLeft, ChevronRight, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@/components/ui/alert-dialog';
import {
  buildChangedItemFeedbacks,
  createGradingDraftState,
  getSubmissionDisplayName,
  GradingEditor,
  parseDraftScore,
} from './GradingPanel';
import type { BatchGradeItem, Submission, TeacherGradeInput } from '@/types/grading';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { batchGradeSubmissions } from '@services/grading/grading';
import SubmissionStatusBadge from './SubmissionStatusBadge';
import type { GradingDraftState } from './GradingPanel';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BatchGradingPanelProps {
  open: boolean;
  submissions: Submission[];
  onClose: () => void;
  onSubmitted?: () => Promise<void> | void;
}

type LocalGrade = GradingDraftState & {
  status: TeacherGradeInput['status'];
  dirty: boolean;
};

function getInitialBatchStatus(submission: Submission): TeacherGradeInput['status'] {
  if (submission.status === 'RETURNED') return 'RETURNED';
  if (submission.status === 'GRADED') return 'GRADED';
  return 'GRADED';
}

function createLocalGrade(submission: Submission): LocalGrade {
  return {
    ...createGradingDraftState(submission),
    status: getInitialBatchStatus(submission),
    dirty: false,
  };
}

export default function BatchGradingPanel({ open, submissions, onClose, onSubmitted }: BatchGradingPanelProps) {
  const t = useTranslations('Grading.Batch');
  const panelT = useTranslations('Grading.Panel');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const submissionKey = useMemo(
    () => submissions.map((submission) => submission.submission_uuid).join('|'),
    [submissions],
  );

  useEffect(() => {
    if (!open) return;
    setCurrentIndex(0);
    setDrafts(new Map(submissions.map((submission) => [submission.submission_uuid, createLocalGrade(submission)])));
  }, [open, submissionKey, submissions]);

  const dirtyCount = useMemo(() => [...drafts.values()].filter((draft) => draft.dirty).length, [drafts]);

  const currentSubmission = submissions[currentIndex] ?? null;
  const currentDraft = currentSubmission
    ? (drafts.get(currentSubmission.submission_uuid) ?? createLocalGrade(currentSubmission))
    : null;
  const studentName = getSubmissionDisplayName(currentSubmission);

  const updateCurrentDraft = useCallback(
    (updater: (draft: LocalGrade) => LocalGrade) => {
      if (!currentSubmission) return;
      setDrafts((current) => {
        const next = new Map(current);
        const existing = next.get(currentSubmission.submission_uuid) ?? createLocalGrade(currentSubmission);
        next.set(currentSubmission.submission_uuid, updater(existing));
        return next;
      });
    },
    [currentSubmission],
  );

  const tryClose = useCallback(() => {
    if (isSubmitting) return;
    if (dirtyCount > 0) {
      setPendingClose(true);
      return;
    }
    onClose();
  }, [dirtyCount, isSubmitting, onClose]);

  const handleSubmitAll = useCallback(async () => {
    const dirtyPayloads = submissions
      .map((submission) => {
        const draft = drafts.get(submission.submission_uuid);
        if (!draft?.dirty) return null;

        const finalScore = parseDraftScore(draft.score);
        if (finalScore === null) {
          return { error: submission.submission_uuid } as const;
        }

        const initialDraft = createGradingDraftState(submission);
        const itemFeedback = buildChangedItemFeedbacks(draft.itemFeedbacks, initialDraft.itemFeedbacks);
        const payload: BatchGradeItem = {
          submission_uuid: submission.submission_uuid,
          final_score: finalScore,
          status: draft.status,
          feedback: draft.feedback || null,
          item_feedback: itemFeedback.length > 0 ? itemFeedback : null,
        };
        return payload;
      })
      .filter((entry): entry is BatchGradeItem | { error: string } => entry !== null);

    if (dirtyPayloads.length === 0) {
      toast.error(t('nothingToSubmit'));
      setConfirmSubmitOpen(false);
      return;
    }

    const invalidSubmission = dirtyPayloads.find((entry) => 'error' in entry);
    if (invalidSubmission && 'error' in invalidSubmission) {
      toast.error(t('scoreRequired'));
      setConfirmSubmitOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads = dirtyPayloads.filter((entry): entry is BatchGradeItem => !('error' in entry));
      const result = await batchGradeSubmissions(payloads);

      if (result.failed > 0) {
        const failures = result.results
          .filter((item) => !item.success)
          .map((item) => {
            const submission = submissions.find((candidate) => candidate.submission_uuid === item.submission_uuid);
            return `${getSubmissionDisplayName(submission)}: ${item.error ?? t('unknownError')}`;
          })
          .join('; ');
        toast.error(t('submitSummary', { succeeded: result.succeeded, failed: result.failed }), {
          description: failures,
        });
      } else {
        toast.success(t('submitSummary', { succeeded: result.succeeded, failed: result.failed }));
      }

      await onSubmitted?.();
      setConfirmSubmitOpen(false);
      onClose();
    } catch {
      toast.error(t('submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [drafts, onClose, onSubmitted, submissions, t]);

  if (!currentSubmission || !currentDraft) {
    return null;
  }

  return (
    <>
      <AlertDialog
        open={pendingClose}
        onOpenChange={(nextOpen) => !nextOpen && setPendingClose(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('unsavedDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingClose(false)}>{panelT('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                onClose();
              }}
            >
              {panelT('discardAndContinue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmSubmitOpen}
        onOpenChange={setConfirmSubmitOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmSubmitTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmSubmitDesc', { count: dirtyCount })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{panelT('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSubmitAll()}>
              {t('confirmSubmitAction', { count: dirtyCount })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer
        open={open && submissions.length > 0}
        onOpenChange={(nextOpen) => !nextOpen && tryClose()}
        direction="right"
      >
        <DrawerContent
          className="flex flex-col p-0"
          style={{ maxWidth: '56rem' }}
        >
          <DrawerTitle className="sr-only">{t('title', { count: submissions.length })}</DrawerTitle>
          <div className="space-y-4 border-b px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{t('title', { count: submissions.length })}</h2>
                <p className="text-muted-foreground text-sm">{t('subtitle', { count: dirtyCount })}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={tryClose}
                aria-label={t('close')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {t('position', {
                      current: currentIndex + 1,
                      total: submissions.length,
                      student: studentName,
                    })}
                  </span>
                  {currentSubmission.is_late ? (
                    <Badge
                      variant="outline"
                      className="border-destructive bg-destructive/20 text-destructive text-xs"
                    >
                      {panelT('late')}
                    </Badge>
                  ) : null}
                  <SubmissionStatusBadge status={currentSubmission.status} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {panelT('attempt')} #{currentSubmission.attempt_number} ·{' '}
                  {currentSubmission.submitted_at
                    ? new Date(currentSubmission.submitted_at).toLocaleString()
                    : panelT('notYetSubmitted')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {panelT('previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentIndex >= submissions.length - 1}
                  onClick={() => setCurrentIndex((index) => Math.min(submissions.length - 1, index + 1))}
                >
                  {panelT('next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <GradingEditor
            submission={currentSubmission}
            isLoading={false}
            draft={currentDraft}
            onScoreChange={(value) => updateCurrentDraft((draft) => ({ ...draft, score: value, dirty: true }))}
            onFeedbackChange={(value) => updateCurrentDraft((draft) => ({ ...draft, feedback: value, dirty: true }))}
            onItemFeedbackChange={(itemId, field, value) =>
              updateCurrentDraft((draft) => ({
                ...draft,
                dirty: true,
                itemFeedbacks: {
                  ...draft.itemFeedbacks,
                  [itemId]: {
                    ...(draft.itemFeedbacks[itemId] ?? { score: '', feedback: '' }),
                    [field]: value,
                  },
                },
              }))
            }
            t={panelT}
          />

          <div className="bg-muted space-y-4 border-t px-6 py-4">
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              <span>{t('indicatorNotEdited')}</span>
              <span className="inline-flex items-center gap-1.5">
                {submissions.map((submission) => {
                  const draft = drafts.get(submission.submission_uuid);
                  const isEdited = draft?.dirty ?? false;
                  return (
                    <span
                      key={submission.submission_uuid}
                      className={cn(
                        'h-2.5 w-2.5 rounded-full border border-slate-300',
                        isEdited ? 'bg-primary border-primary' : 'bg-background',
                      )}
                    />
                  );
                })}
              </span>
              <span>{t('indicatorEdited')}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => toast.success(t('draftSaved'))}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <BookOpenCheck className="h-4 w-4" />
                {t('saveDraft')}
              </Button>

              <Button
                type="button"
                onClick={() => setConfirmSubmitOpen(true)}
                disabled={isSubmitting || dirtyCount === 0}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? t('submitting') : t('submitAll', { count: dirtyCount })}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
