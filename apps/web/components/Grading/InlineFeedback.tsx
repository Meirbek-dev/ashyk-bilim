'use client';

import { MessageSquareText } from 'lucide-react';
import type { ChangeEvent } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface InlineFeedbackProps {
  score: string;
  maxScore: number;
  feedback: string;
  disabled?: boolean;
  scoreInvalid?: boolean;
  labels: {
    score: string;
    feedback: string;
    feedbackPlaceholder: string;
  };
  onScoreChange: (value: string) => void;
  onFeedbackChange: (value: string) => void;
}

export default function InlineFeedback({
  score,
  maxScore,
  feedback,
  disabled = false,
  scoreInvalid = false,
  labels,
  onScoreChange,
  onFeedbackChange,
}: InlineFeedbackProps) {
  const handleScoreChange = (event: ChangeEvent<HTMLInputElement>) => {
    onScoreChange(event.target.value);
  };

  const handleFeedbackChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onFeedbackChange(event.target.value);
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">{labels.score}</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={maxScore}
              step={0.5}
              placeholder="0"
              value={score}
              disabled={disabled}
              onChange={handleScoreChange}
              className={cn('w-20 text-center text-xs', scoreInvalid && 'border-destructive')}
            />
            <span className="text-muted-foreground text-xs">/ {maxScore}</span>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5 text-xs font-medium">
          <MessageSquareText className="h-3.5 w-3.5" />
          {labels.feedback}
        </Label>
        <Textarea
          rows={1}
          placeholder={labels.feedbackPlaceholder}
          value={feedback}
          disabled={disabled}
          onChange={handleFeedbackChange}
          className="resize-none text-xs"
        />
      </div>
    </div>
  );
}
