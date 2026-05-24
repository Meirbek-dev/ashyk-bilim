'use client';

import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { EditableItem } from '@/features/assessments/studio/studioTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface QuestionInspectorPanelProps {
  item: EditableItem;
  isEditable: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (next: EditableItem) => void;
}

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const;
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number];

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
  hard: 'bg-red-100 text-red-800 ring-red-300 dark:bg-red-900/30 dark:text-red-300',
};

/** Extracts explanation from CHOICE or MATCHING item bodies. */
function getExplanation(item: EditableItem): string {
  if (item.body.kind === 'CHOICE') return item.body.explanation ?? '';
  if (item.body.kind === 'MATCHING') return item.body.explanation ?? '';
  return '';
}

function setExplanation(item: EditableItem, value: string): EditableItem {
  if (item.body.kind === 'CHOICE') {
    return { ...item, body: { ...item.body, explanation: value || null } };
  }
  if (item.body.kind === 'MATCHING') {
    return { ...item, body: { ...item.body, explanation: value || null } };
  }
  return item;
}

const SUPPORTS_EXPLANATION = new Set<string>(['CHOICE', 'MATCHING']);

export default function QuestionInspectorPanel({
  item,
  isEditable,
  isOpen,
  onToggle,
  onChange,
}: QuestionInspectorPanelProps) {
  const t = useTranslations('Features.Assessments.Studio.Inspector');

  const explanation = getExplanation(item);
  const supportsExplanation = SUPPORTS_EXPLANATION.has(item.kind);

  // Difficulty is stored in a custom optional metadata field on the item body.
  // We use a simple cast since this optional UI-layer field has no backend schema yet.
  const difficulty: Difficulty = ((item as unknown as { _difficulty?: string })._difficulty as Difficulty) ?? 'medium';

  const setDifficulty = (d: Difficulty) => {
    onChange({ ...item, _difficulty: d});
  };

  return (
    <>
      {/* Toggle button (visible when panel is closed) */}
      {!isOpen && (
        <Button
          type="button"
          variant="ghost"
          onClick={onToggle}
          title={t('open')}
          className="bg-card hover:bg-muted flex h-auto shrink-0 flex-col items-center justify-center gap-1.5 rounded-none border border-l px-1.5 py-3"
        >
          <SlidersHorizontal className="text-muted-foreground size-4" />
          <span className="text-muted-foreground text-[9px] font-medium [writing-mode:vertical-rl]">{t('title')}</span>
        </Button>
      )}

      {/* Panel */}
      <aside
        className={cn(
          'bg-card flex shrink-0 flex-col border-l transition-all duration-200',
          isOpen ? 'w-64' : 'w-0 overflow-hidden border-l-0',
        )}
      >
        {isOpen && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="text-muted-foreground size-4" />
                <h3 className="text-sm font-semibold">{t('title')}</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onToggle}
                title={t('close')}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {/* Points */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="inspector-points"
                  className="text-xs font-medium"
                >
                  {t('pointsLabel')}
                </Label>
                <Input
                  id="inspector-points"
                  type="number"
                  min={0}
                  step={0.5}
                  value={item.max_score ?? 0}
                  disabled={!isEditable}
                  className="h-8 text-sm"
                  onChange={(e) => {
                    const val = Number.parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 0) {
                      onChange({ ...item, max_score: val });
                    }
                  }}
                />
              </div>

              {/* Difficulty */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('difficultyLabel')}</Label>
                <div className="flex gap-1.5">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!isEditable}
                      onClick={() => setDifficulty(d)}
                      className={cn(
                        'flex-1 rounded px-2 py-1 text-[11px] font-medium ring-1 transition-all h-auto',
                        difficulty === d ? DIFFICULTY_COLORS[d] : 'bg-muted text-muted-foreground ring-transparent',
                        !isEditable && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {t(`difficulty.${d}`)}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-[10px]">{t('difficultyNote')}</p>
              </div>

              {/* Explanation */}
              {supportsExplanation && (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="inspector-explanation"
                    className="text-xs font-medium"
                  >
                    {t('explanationLabel')}
                  </Label>
                  <Textarea
                    id="inspector-explanation"
                    rows={4}
                    placeholder={t('explanationPlaceholder')}
                    value={explanation}
                    disabled={!isEditable}
                    className="resize-none text-sm"
                    onChange={(e) => onChange(setExplanation(item, e.target.value))}
                  />
                  <p className="text-muted-foreground text-[10px]">{t('explanationDesc')}</p>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
