'use client';

import { BookOpenCheck, ChevronLeft, ChevronRight, RotateCcw, Send, Wand2 } from 'lucide-react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { GradedItem, ItemFeedback, Submission, TeacherGradeInput } from '@/types/grading';
import SubmissionStatusBadge from './SubmissionStatusBadge';
import { useGradingPanel } from '@/hooks/useGradingPanel';
import { saveGrade } from '@services/grading/grading';
import { canTeacherEditGrade } from '@/types/grading';

interface GradingPanelProps {
  submissionUuid: string | null;
  allSubmissionUuids: string[];
  onClose: () => void;
  onGradeSaved?: (updated: Submission) => void;
  onNavigate?: (uuid: string) => void;
}

export type ItemFeedbackMap = Record<string, { score: string; feedback: string }>;

export interface GradingDraftState {
  score: string;
  feedback: string;
  itemFeedbacks: ItemFeedbackMap;
}

export function createItemFeedbackMap(items: GradedItem[] = []): ItemFeedbackMap {
  const map: ItemFeedbackMap = {};
  for (const item of items) {
    map[item.item_id] = {
      score: item.score !== null ? String(item.score) : '',
      feedback: item.feedback ?? '',
    };
  }
  return map;
}

export function createGradingDraftState(submission: Submission | null | undefined): GradingDraftState {
  if (!submission) {
    return { score: '', feedback: '', itemFeedbacks: {} };
  }

  return {
    score: submission.final_score !== null ? String(submission.final_score) : '',
    feedback: submission.grading_json?.feedback ?? '',
    itemFeedbacks: createItemFeedbackMap(submission.grading_json?.items ?? []),
  };
}

export function buildChangedItemFeedbacks(current: ItemFeedbackMap, initial: ItemFeedbackMap): ItemFeedback[] {
  return Object.entries(current)
    .filter(([itemId, value]) => {
      const initialValue = initial[itemId] ?? { score: '', feedback: '' };
      return value.score !== initialValue.score || value.feedback !== initialValue.feedback;
    })
    .map(([item_id, value]) => ({
      item_id,
      score: value.score !== '' ? Number.parseFloat(value.score) : undefined,
      feedback: value.feedback,
    }));
}

export function parseDraftScore(score: string): number | null {
  if (score === '') return null;
  const parsed = Number.parseFloat(score);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }
  return parsed;
}

export function isDraftDirty(current: GradingDraftState, initial: GradingDraftState): boolean {
  if (current.score !== initial.score) return true;
  if (current.feedback !== initial.feedback) return true;

  const itemIds = new Set([...Object.keys(initial.itemFeedbacks), ...Object.keys(current.itemFeedbacks)]);
  for (const itemId of itemIds) {
    const currentValue = current.itemFeedbacks[itemId] ?? { score: '', feedback: '' };
    const initialValue = initial.itemFeedbacks[itemId] ?? { score: '', feedback: '' };
    if (currentValue.score !== initialValue.score || currentValue.feedback !== initialValue.feedback) {
      return true;
    }
  }

  return false;
}

export function getSubmissionDisplayName(submission: Submission | null | undefined): string {
  if (!submission?.user) return '—';
  return (
    [submission.user.first_name, submission.user.middle_name, submission.user.last_name].filter(Boolean).join(' ') ||
    `@${submission.user.username}`
  );
}

function getScoreInvalid(score: string): boolean {
  return score !== '' && parseDraftScore(score) === null;
}

interface GradingEditorProps {
  submission: Submission | null;
  isLoading: boolean;
  draft: GradingDraftState;
  onScoreChange: (value: string) => void;
  onFeedbackChange: (value: string) => void;
  onItemFeedbackChange: (itemId: string, field: 'score' | 'feedback', value: string) => void;
  t: ReturnType<typeof useTranslations<'Grading.Panel'>>;
}

export function GradingEditor({
  submission,
  isLoading,
  draft,
  onScoreChange,
  onFeedbackChange,
  onItemFeedbackChange,
  t,
}: GradingEditorProps) {
  const scoreInvalid = getScoreInvalid(draft.score);

  const autoSumScore = useMemo(() => {
    const items = submission?.grading_json?.items ?? [];
    if (!items.length) return null;
    const totalMax = items.reduce((sum, item) => sum + item.max_score, 0);
    if (!totalMax) return null;

    const totalScore = items.reduce((sum, item) => {
      const raw = draft.itemFeedbacks[item.item_id]?.score;
      const parsed = raw !== undefined && raw !== '' ? Number.parseFloat(raw) : item.score;
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);

    return Math.round((totalScore / totalMax) * 100 * 100) / 100;
  }, [draft.itemFeedbacks, submission?.grading_json?.items]);

  return (
    <>
      <div className="space-y-4 border-b px-6 py-4">
        <div className="flex flex-wrap items-end gap-6 pt-1">
          <div className="space-y-1.5">
            <Label
              htmlFor="final-score"
              className="text-sm font-medium"
            >
              {t('finalScore')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="final-score"
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="0–100"
                value={draft.score}
                onChange={(event) => onScoreChange(event.target.value)}
                className={cn(
                  'w-28 text-center font-semibold',
                  scoreInvalid && 'border-destructive focus-visible:ring-destructive',
                )}
              />
              <span className="text-muted-foreground text-sm">/ 100</span>
            </div>
            {scoreInvalid ? <p className="text-destructive text-xs">{t('invalidScore')}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            {submission?.auto_score !== null && submission?.auto_score !== undefined ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {t('autoScore')}: <strong>{submission.auto_score}/100</strong>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={() => onScoreChange(String(submission.auto_score))}
                >
                  <Wand2 className="h-3 w-3" />
                  {t('useAutoScore')}
                </Button>
              </div>
            ) : null}

            {autoSumScore !== null ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {t('autoSum')}: <strong>{autoSumScore}/100</strong>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={() => onScoreChange(String(autoSumScore))}
                >
                  <Wand2 className="h-3 w-3" />
                  {t('useAutoSum')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6 py-4">
        {isLoading ? (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t('loading')}</div>
        ) : submission ? (
          <SubmissionAnswers
            submission={submission}
            itemFeedbacks={draft.itemFeedbacks}
            onItemFeedbackChange={onItemFeedbackChange}
            t={t}
          />
        ) : (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t('noData')}</div>
        )}
      </ScrollArea>

      <div className="bg-muted gap-4 border-t px-6 py-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="feedback"
            className="text-sm font-medium"
          >
            {t('feedback')} <span className="text-muted-foreground font-normal">({t('optional')})</span>
          </Label>
          <Textarea
            id="feedback"
            rows={2}
            placeholder={t('feedbackPlaceholder')}
            value={draft.feedback}
            onChange={(event) => onFeedbackChange(event.target.value)}
          />
        </div>
      </div>
    </>
  );
}

export default function GradingPanel({
  submissionUuid,
  allSubmissionUuids,
  onClose,
  onGradeSaved,
  onNavigate,
}: GradingPanelProps) {
  const t = useTranslations('Grading.Panel');
  const { submission, isLoading, mutate } = useGradingPanel(submissionUuid);

  const [draft, setDraft] = useState<GradingDraftState>({
    score: '',
    feedback: '',
    itemFeedbacks: {},
  });
  const [isSaving, setIsSaving] = useState(false);
  const initialRef = useRef<GradingDraftState>({
    score: '',
    feedback: '',
    itemFeedbacks: {},
  });

  const [pendingNavigate, setPendingNavigate] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  useEffect(() => {
    const initialDraft = createGradingDraftState(submission);
    setDraft(initialDraft);
    initialRef.current = initialDraft;
  }, [submission?.id, submissionUuid, submission]);

  const isDirty = useMemo(() => isDraftDirty(draft, initialRef.current), [draft]);
  const scoreInvalid = getScoreInvalid(draft.score);

  const currentIndex = submissionUuid ? allSubmissionUuids.indexOf(submissionUuid) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allSubmissionUuids.length - 1;

  const tryNavigate = useCallback(
    (uuid: string) => {
      if (isSaving || publishOpen || returnOpen) {
        return;
      }

      if (isDirty) {
        setPendingNavigate(uuid);
      } else {
        onNavigate?.(uuid);
      }
    },
    [isDirty, isSaving, onNavigate, publishOpen, returnOpen],
  );

  const tryClose = useCallback(() => {
    if (isSaving || publishOpen || returnOpen) {
      return;
    }

    if (isDirty) {
      setPendingClose(true);
    } else {
      onClose();
    }
  }, [isDirty, isSaving, onClose, publishOpen, returnOpen]);

  const handleDiscardAndContinue = useCallback(() => {
    if (pendingNavigate) {
      onNavigate?.(pendingNavigate);
      setPendingNavigate(null);
    } else {
      onClose();
      setPendingClose(false);
    }

    setPublishOpen(false);
    setReturnOpen(false);
  }, [onClose, onNavigate, pendingNavigate]);

  const handleCancelDiscard = useCallback(() => {
    setPendingNavigate(null);
    setPendingClose(false);
    setPublishOpen(false);
    setReturnOpen(false);
  }, []);

  const handleSaveGrade = useCallback(
    async (status: TeacherGradeInput['status']) => {
      if (!submissionUuid) return;

      const score = parseDraftScore(draft.score);
      if (scoreInvalid || score === null) {
        toast.error(t('invalidScore'));
        return;
      }

      const input: TeacherGradeInput = {
        final_score: score,
        status,
        feedback: draft.feedback,
        item_feedback: buildChangedItemFeedbacks(draft.itemFeedbacks, initialRef.current.itemFeedbacks),
      };

      setIsSaving(true);
      try {
        const updated = await saveGrade(submissionUuid, input);
        const msgKey = status === 'PUBLISHED' ? 'gradePublished' : status === 'RETURNED' ? 'returned' : 'gradeSaved';
        toast.success(t(msgKey));

        const nextInitial = createGradingDraftState(updated);
        initialRef.current = nextInitial;
        setDraft(nextInitial);

        setPendingNavigate(null);
        setPendingClose(false);
        setPublishOpen(false);
        setReturnOpen(false);

        onGradeSaved?.(updated);
        void mutate();
      } catch {
        toast.error(t('saveFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [draft, mutate, onGradeSaved, scoreInvalid, submissionUuid, t],
  );

  const saveDraftStatus: TeacherGradeInput['status'] = submission?.status === 'PUBLISHED' ? 'PUBLISHED' : 'GRADED';

  const studentName = getSubmissionDisplayName(submission);
  const canSave = !isSaving && draft.score !== '' && !scoreInvalid;
  const unsavedOpen = (pendingNavigate !== null || pendingClose) && !isSaving && !publishOpen && !returnOpen;

  return (
    <>
      <AlertDialog
        open={unsavedOpen}
        onOpenChange={(open) => !open && handleCancelDiscard()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('unsavedDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDiscard}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardAndContinue}>{t('discardAndContinue')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer
        open={Boolean(submissionUuid)}
        onOpenChange={(open) => !open && tryClose()}
        direction="right"
      >
        <DrawerContent
          className="flex flex-col p-0"
          style={{ maxWidth: '48rem' }}
        >
          <DrawerTitle className="sr-only">{t('title')}</DrawerTitle>
          <div className="space-y-3 border-b px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h2 className="truncate text-base font-semibold">{studentName}</h2>
                {submission?.is_late ? (
                  <Badge
                    variant="outline"
                    className="border-destructive bg-destructive/20 text-destructive shrink-0 text-xs"
                  >
                    {t('late')}
                  </Badge>
                ) : null}
              </div>
              {submission ? <SubmissionStatusBadge status={submission.status} /> : null}
            </div>

            <p className="text-muted-foreground text-xs">
              {t('attempt')} #{submission?.attempt_number ?? '—'} ·{' '}
              {submission?.submitted_at ? new Date(submission.submitted_at).toLocaleString() : t('notYetSubmitted')}
            </p>

            {allSubmissionUuids.length > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasPrev}
                  onClick={() => {
                    const previousUuid = allSubmissionUuids[currentIndex - 1];
                    if (previousUuid) {
                      tryNavigate(previousUuid);
                    }
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('previous')}
                </Button>
                <span className="text-muted-foreground text-xs">
                  {currentIndex + 1} / {allSubmissionUuids.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNext}
                  onClick={() => {
                    const nextUuid = allSubmissionUuids[currentIndex + 1];
                    if (nextUuid) {
                      tryNavigate(nextUuid);
                    }
                  }}
                >
                  {t('next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>

          <GradingEditor
            submission={submission}
            isLoading={isLoading}
            draft={draft}
            onScoreChange={(value) => setDraft((current) => ({ ...current, score: value }))}
            onFeedbackChange={(value) => setDraft((current) => ({ ...current, feedback: value }))}
            onItemFeedbackChange={(itemId, field, value) =>
              setDraft((current) => ({
                ...current,
                itemFeedbacks: {
                  ...current.itemFeedbacks,
                  [itemId]: {
                    ...(current.itemFeedbacks[itemId] ?? { score: '', feedback: '' }),
                    [field]: value,
                  },
                },
              }))
            }
            t={t}
          />

          <div className="bg-muted space-y-4 border-t px-6 py-4">
            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <AlertDialog
                open={returnOpen}
                onOpenChange={setReturnOpen}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canSave}
                  className="gap-1.5"
                  onClick={() => setReturnOpen(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('returnToStudent')}
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('confirmReturnTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('confirmReturnDesc')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleSaveGrade('RETURNED')}>{t('confirm')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!canSave}
                  onClick={() => handleSaveGrade(saveDraftStatus)}
                  className="gap-1.5"
                >
                  <BookOpenCheck className="h-4 w-4" />
                  {isSaving ? t('saving') : t('saveDraft')}
                </Button>

                <AlertDialog
                  open={publishOpen}
                  onOpenChange={setPublishOpen}
                >
                  <Button
                    disabled={!canSave}
                    className="gap-1.5"
                    onClick={() => setPublishOpen(true)}
                  >
                    <Send className="h-4 w-4" />
                    {t('publishGrade')}
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('confirmPublishTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('confirmPublishDesc')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleSaveGrade('PUBLISHED')}>{t('confirm')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

interface SubmissionAnswersProps {
  submission: Submission;
  itemFeedbacks: ItemFeedbackMap;
  onItemFeedbackChange: (itemId: string, field: 'score' | 'feedback', value: string) => void;
  t: ReturnType<typeof useTranslations<'Grading.Panel'>>;
}

function SubmissionAnswers({ submission, itemFeedbacks, onItemFeedbackChange, t }: SubmissionAnswersProps) {
  const breakdown = submission.grading_json;
  const isEditable = canTeacherEditGrade(submission.status);

  if (!breakdown?.items?.length) {
    return <p className="text-muted-foreground text-sm">{t('noBreakdown')}</p>;
  }

  return (
    <div className="space-y-4">
      {breakdown.needs_manual_review ? (
        <div className="border-secondary/50 bg-secondary/10 text-primary rounded-md border px-4 py-2 text-sm">
          {t('manualReviewRequired')}
        </div>
      ) : null}
      {breakdown.items.map((item, index) => (
        <AnswerItem
          key={item.item_id}
          item={item}
          index={index}
          itemFeedback={itemFeedbacks[item.item_id] ?? { score: '', feedback: '' }}
          isEditable={isEditable}
          onFeedbackChange={(field, value) => onItemFeedbackChange(item.item_id, field, value)}
          t={t}
        />
      ))}
    </div>
  );
}

interface AnswerItemProps {
  item: GradedItem;
  index: number;
  itemFeedback: { score: string; feedback: string };
  isEditable: boolean;
  onFeedbackChange: (field: 'score' | 'feedback', value: string) => void;
  t: ReturnType<typeof useTranslations<'Grading.Panel'>>;
}

function AnswerItem({ item, index, itemFeedback, isEditable, onFeedbackChange, t }: AnswerItemProps) {
  const scoreNum = Number.parseFloat(itemFeedback.score);
  const itemScoreInvalid =
    itemFeedback.score !== '' && (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > item.max_score);

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {item.needs_manual_review ? (
            <Badge
              variant="outline"
              className="border-secondary/20 bg-secondary/10 text-secondary-foreground text-xs"
            >
              {t('needsReview')}
            </Badge>
          ) : null}
          <p className="text-foreground text-sm font-medium">
            {index + 1}. {item.item_text || item.item_id}
          </p>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs font-semibold">
          {item.score} / {item.max_score}
        </span>
      </div>

      {item.user_answer !== null ? (
        <div className="bg-muted/70 text-muted-foreground rounded px-3 py-2 text-sm">
          <span className="text-muted-foreground mr-1 text-xs font-medium">{t('studentAnswer')}:</span>
          {typeof item.user_answer === 'string' ? item.user_answer : JSON.stringify(item.user_answer, null, 2)}
        </div>
      ) : null}

      {item.correct === false && item.correct_answer !== null ? (
        <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="mr-1 text-xs font-medium text-emerald-600">{t('correctAnswer')}:</span>
          {typeof item.correct_answer === 'string' ? item.correct_answer : JSON.stringify(item.correct_answer)}
        </div>
      ) : null}

      {item.feedback && !item.needs_manual_review ? (
        <p className="text-muted-foreground text-xs italic">{item.feedback}</p>
      ) : null}

      {isEditable ? (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">{t('itemScore')}</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={item.max_score}
                  step={0.5}
                  placeholder="0"
                  value={itemFeedback.score}
                  onChange={(event) => onFeedbackChange('score', event.target.value)}
                  className={cn('w-20 text-center text-xs', itemScoreInvalid && 'border-destructive')}
                />
                <span className="text-muted-foreground text-xs">/ {item.max_score}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">{t('itemFeedback')}</Label>
            <Textarea
              rows={1}
              placeholder={t('itemFeedbackPlaceholder')}
              value={itemFeedback.feedback}
              onChange={(event) => onFeedbackChange('feedback', event.target.value)}
              className="resize-none text-xs"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
