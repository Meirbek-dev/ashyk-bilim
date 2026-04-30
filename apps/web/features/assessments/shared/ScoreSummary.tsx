'use client';

import { Info } from 'lucide-react';

import { formatPercent } from '@/features/assessments/domain/score';
import type { NormalizedScore } from '@/features/assessments/domain/score';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ScoreSummaryProps {
  score: NormalizedScore;
  rawScore?: number | null;
  maxScore?: number | null;
  className?: string;
}

const SOURCE_LABELS: Record<NormalizedScore['source'], string> = {
  auto: 'Auto-graded',
  teacher: 'Teacher grade',
  none: 'Not graded',
};

export default function ScoreSummary({ score, rawScore, maxScore, className }: ScoreSummaryProps) {
  const percent = formatPercent(score.percent);
  const hasRaw =
    rawScore !== null && rawScore !== undefined && maxScore !== null && maxScore !== undefined && maxScore > 0;
  const sourceLabel = SOURCE_LABELS[score.source];
  const detail = hasRaw ? `${rawScore}/${maxScore} points · ${percent}` : `${sourceLabel} · ${percent}`;

  return (
    <div className={cn('rounded-md border bg-card p-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{percent}</div>
          <div className="text-muted-foreground text-xs">{detail}</div>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<Info className="text-muted-foreground size-4" />} />
            <TooltipContent>
              Scores are normalized to a 0-100 percent scale. Teacher grades take priority over auto scores.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
