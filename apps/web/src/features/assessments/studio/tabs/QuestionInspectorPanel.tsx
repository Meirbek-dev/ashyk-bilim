'use client'

import { ChevronRight, SlidersHorizontal, Tags, Target, Timer } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { EditableItem } from '@/features/assessments/studio/studioTypes'
import { splitMetadataList } from '@/features/assessments/studio/tabs/builderUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface QuestionInspectorPanelProps {
  item: EditableItem
  isEditable: boolean
  isOpen: boolean
  onToggle: () => void
  onChange: (next: EditableItem) => void
}

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number]

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
  hard: 'bg-red-100 text-red-800 ring-red-300 dark:bg-red-900/30 dark:text-red-300',
}

export default function QuestionInspectorPanel({
  item,
  isEditable,
  isOpen,
  onToggle,
  onChange,
}: QuestionInspectorPanelProps) {
  const t = useTranslations('Features.Assessments.Studio.Inspector')
  const difficulty: Difficulty = item.metadata.difficulty ?? 'medium'

  const setDifficulty = (d: Difficulty) => {
    onChange({ ...item, metadata: { ...item.metadata, difficulty: d } })
  }

  return (
    <>
      {/* Toggle button (visible when panel is closed) */}
      {!isOpen && (
        <Button
          type="button"
          variant="ghost"
          onClick={onToggle}
          aria-label={t('open')}
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
                aria-label={t('close')}
                title={t('close')}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {/* Points */}
              <div className="space-y-1.5">
                <Label htmlFor="inspector-points" className="text-xs font-medium">
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
                  onChange={e => {
                    const val = Number.parseFloat(e.target.value)
                    if (!Number.isNaN(val) && val >= 0) {
                      onChange({ ...item, max_score: val })
                    }
                  }}
                />
              </div>

              {/* Difficulty */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('difficultyLabel')}</Label>
                <div className="flex gap-1.5">
                  {DIFFICULTY_OPTIONS.map(d => (
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

              <div className="space-y-1.5">
                <Label htmlFor="inspector-estimated-minutes" className="flex items-center gap-1.5 text-xs font-medium">
                  <Timer className="size-3.5" />
                  {t('estimatedMinutesLabel')}
                </Label>
                <Input
                  id="inspector-estimated-minutes"
                  type="number"
                  min={0}
                  step={1}
                  value={item.metadata.estimated_minutes ?? ''}
                  disabled={!isEditable}
                  className="h-8 text-sm"
                  onChange={event =>
                    onChange({
                      ...item,
                      metadata: {
                        ...item.metadata,
                        estimated_minutes: event.target.value ? Number(event.target.value) : null,
                      },
                    })
                  }
                />
                <p className="text-muted-foreground text-[10px]">{t('estimatedMinutesDesc')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inspector-tags" className="flex items-center gap-1.5 text-xs font-medium">
                  <Tags className="size-3.5" />
                  {t('tagsLabel')}
                </Label>
                <Input
                  id="inspector-tags"
                  value={item.metadata.tags.join(', ')}
                  disabled={!isEditable}
                  className="h-8 text-sm"
                  placeholder={t('tagsPlaceholder')}
                  onChange={event =>
                    onChange({
                      ...item,
                      metadata: { ...item.metadata, tags: splitMetadataList(event.target.value) },
                    })
                  }
                />
                <p className="text-muted-foreground text-[10px]">{t('commaSeparated')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inspector-outcomes" className="flex items-center gap-1.5 text-xs font-medium">
                  <Target className="size-3.5" />
                  {t('outcomesLabel')}
                </Label>
                <Input
                  id="inspector-outcomes"
                  value={item.metadata.outcome_ids.join(', ')}
                  disabled={!isEditable}
                  className="h-8 text-sm"
                  placeholder={t('outcomesPlaceholder')}
                  onChange={event =>
                    onChange({
                      ...item,
                      metadata: { ...item.metadata, outcome_ids: splitMetadataList(event.target.value) },
                    })
                  }
                />
                <p className="text-muted-foreground text-[10px]">{t('outcomesDesc')}</p>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
