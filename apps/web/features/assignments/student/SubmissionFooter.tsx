'use client';

import { CheckCircle2, LoaderCircle, RotateCcw, Save, SendHorizonal } from 'lucide-react';

import type { SubmissionStatus } from '@/features/grading/domain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type DraftSaveState = 'saved' | 'unsaved' | 'saving' | 'submitted' | 'returned' | 'error';

interface SubmissionFooterProps {
  state: DraftSaveState;
  status: SubmissionStatus | null;
  canSave: boolean;
  canSubmit: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  onSave: () => void;
  onSubmit: () => void;
}

export default function SubmissionFooter({
  state,
  status,
  canSave,
  canSubmit,
  isSaving,
  isSubmitting,
  onSave,
  onSubmit,
}: SubmissionFooterProps) {
  const returned = status === 'RETURNED';
  return (
    <div className="bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FooterStateBadge
            state={returned ? 'returned' : state}
            status={status}
          />
          {canSave ? <span className="text-sm text-muted-foreground">You have unsaved changes.</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSave || isSaving || isSubmitting}
            onClick={onSave}
          >
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save draft
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isSaving || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
            {returned ? 'Re-submit' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FooterStateBadge({ state, status }: { state: DraftSaveState; status: SubmissionStatus | null }) {
  if (state === 'saving') return <Badge variant="secondary"><LoaderCircle className="size-3 animate-spin" />Saving</Badge>;
  if (state === 'unsaved') return <Badge variant="warning">Unsaved</Badge>;
  if (state === 'error') return <Badge variant="destructive">Save failed</Badge>;
  if (state === 'submitted' || status === 'PENDING') return <Badge variant="secondary"><CheckCircle2 className="size-3" />Submitted</Badge>;
  if (state === 'returned') return <Badge variant="warning"><RotateCcw className="size-3" />Returned</Badge>;
  if (status === 'GRADED') return <Badge variant="secondary">Awaiting release</Badge>;
  if (status === 'PUBLISHED') return <Badge variant="success">Published</Badge>;
  return <Badge variant="success"><CheckCircle2 className="size-3" />Saved</Badge>;
}
