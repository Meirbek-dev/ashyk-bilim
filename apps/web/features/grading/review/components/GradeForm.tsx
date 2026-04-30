'use client';

import { BookOpenCheck, ChevronLeft, ChevronRight, Info, LoaderCircle, MessageSquareText, RotateCcw, Send } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { canTeacherEditGrade, type TeacherGradeInput } from '@/features/grading/domain';
import { saveGrade } from '@/services/grading/grading';
import { useGradingPanel } from '@/hooks/useGradingPanel';
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
  onSaved,
  navigation,
}: {
  submissionUuid: string | null;
  onSaved: () => Promise<void>;
  navigation: ReviewNavigationState;
}) {
  const { submission, isLoading, mutate } = useGradingPanel(submissionUuid);
  const [draft, setDraft] = useState<GradeDraft>({ score: '', feedback: '' });
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setDraft({
      score:
        submission?.final_score !== null && submission?.final_score !== undefined ? String(submission.final_score) : '',
      feedback: submission?.grading_json?.feedback ?? '',
    });
  }, [submission?.final_score, submission?.grading_json?.feedback, submission?.submission_uuid]);

  const save = (status: TeacherGradeInput['status']) => {
    if (!submission) return;
    const score = Number.parseFloat(draft.score);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      toast.error('Enter a score from 0 to 100.');
      return;
    }

    startSaving(async () => {
      try {
        await saveGrade(submission.submission_uuid, {
          final_score: score,
          feedback: draft.feedback,
          status,
          item_feedback: [],
        });
        toast.success(status === 'PUBLISHED' ? 'Grade published' : status === 'RETURNED' ? 'Returned' : 'Grade saved');
        await Promise.all([mutate(), onSaved()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save grade');
      }
    });
  };

  if (!submissionUuid) {
    return <aside className="text-muted-foreground p-4 text-sm">Select a submission to grade.</aside>;
  }

  if (isLoading && !submission) {
    return (
      <aside className="text-muted-foreground flex items-center justify-center p-4 text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading
      </aside>
    );
  }

  if (!submission) {
    return <aside className="text-muted-foreground p-4 text-sm">Grade form unavailable.</aside>;
  }

  const editable = canTeacherEditGrade(submission.status);

  return (
    <aside className="space-y-5 p-4 xl:sticky xl:top-0 xl:h-[calc(100vh-96px)] xl:overflow-y-auto">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Grade</h2>
          <KeyboardHint />
        </div>
        <p className="text-muted-foreground text-sm">Final score, feedback, and release actions.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!navigation.hasPrevious} onClick={navigation.goPrevious}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!navigation.hasNext} onClick={navigation.goNext}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="review-score">Final score</Label>
        <div className="flex items-center gap-2">
          <Input id="review-score" type="number" min={0} max={100} step={0.5} value={draft.score} disabled={!editable || isSaving} onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))} />
          <span className="text-muted-foreground text-sm">/100</span>
        </div>
        {submission.auto_score !== null && submission.auto_score !== undefined ? (
          <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setDraft((current) => ({ ...current, score: String(submission.auto_score) }))}>
            Use auto score {submission.auto_score}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="review-feedback" className="flex items-center gap-1.5">
          <MessageSquareText className="size-4" />
          Final feedback
        </Label>
        <Textarea id="review-feedback" value={draft.feedback} disabled={!editable || isSaving} className="min-h-36" onChange={(event) => setDraft((current) => ({ ...current, feedback: event.target.value }))} />
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" disabled={!editable || isSaving} onClick={() => save('GRADED')}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
          Save grade
        </Button>
        <Button type="button" disabled={!editable || isSaving} onClick={() => save('PUBLISHED')}>
          <Send className="size-4" />
          Publish grade
        </Button>
        <Button type="button" variant="outline" disabled={!editable || isSaving} onClick={() => save('RETURNED')}>
          <RotateCcw className="size-4" />
          Return for revision
        </Button>
      </div>
    </aside>
  );
}

function KeyboardHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem('grading-review-keyboard-hint-seen') === '1') return;
    setOpen(true);
    window.localStorage.setItem('grading-review-keyboard-hint-seen', '1');
    const timeout = window.setTimeout(() => setOpen(false), 4500);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" className="size-7" />}>
          <Info className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Use j/k or arrow keys to move between submissions.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
