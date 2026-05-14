'use client';

/**
 * ItemRubricEditor — Per-item rubric scoring UI for the teacher review workspace.
 *
 * Renders each assessment item with its max_score, allows per-criterion scoring
 * via RubricCriterion inputs, and auto-calculates the final score.
 */

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface RubricCriterion {
  criterion_id: string;
  label: string;
  score: number;
  max_score: number;
  note: string;
}

interface ItemRubricEditorProps {
  itemUuid: string;
  itemText: string;
  maxScore: number;
  criteria: RubricCriterion[];
  feedback: string;
  disabled?: boolean;
  onCriterionChange: (criterionId: string, field: 'score' | 'note', value: string) => void;
  onFeedbackChange: (value: string) => void;
}

export default function ItemRubricEditor({
  itemUuid,
  itemText,
  maxScore,
  criteria,
  feedback,
  disabled = false,
  onCriterionChange,
  onFeedbackChange,
}: ItemRubricEditorProps) {
  const t = useTranslations('Features.Grading.Review');
  const totalScore = criteria.reduce((sum, c) => sum + c.score, 0);
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{itemText || itemUuid}</p>
        <span
          className={cn(
            'text-xs font-mono',
            percentage >= 80 ? 'text-green-600' : percentage >= 50 ? 'text-yellow-600' : 'text-red-600',
          )}
        >
          {totalScore}/{maxScore} ({percentage}%)
        </span>
      </div>

      {criteria.length > 0 && (
        <div className="border-muted space-y-2 border-l-2 pl-2">
          {criteria.map((criterion) => (
            <div
              key={criterion.criterion_id}
              className="flex items-center gap-2"
            >
              <Label className="min-w-[120px] text-xs">{criterion.label}</Label>
              <Input
                type="number"
                min={0}
                max={criterion.max_score}
                step={0.5}
                value={criterion.score}
                disabled={disabled}
                className="h-7 w-16 text-xs"
                onChange={(e) => onCriterionChange(criterion.criterion_id, 'score', e.target.value)}
              />
              <span className="text-muted-foreground text-xs">/{criterion.max_score}</span>
              <Input
                placeholder={t('itemFeedbackPlaceholder')}
                value={criterion.note}
                disabled={disabled}
                className="h-7 flex-1 text-xs"
                onChange={(e) => onCriterionChange(criterion.criterion_id, 'note', e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <Textarea
        placeholder={t('itemFeedbackPlaceholder')}
        value={feedback}
        disabled={disabled}
        className="min-h-12 text-sm"
        onChange={(e) => onFeedbackChange(e.target.value)}
      />
    </div>
  );
}
