'use client';

import { Lightbulb, Lock, HelpCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MarkdownRenderer } from '@/features/assessments/shared/MarkdownRenderer';
import { cn } from '@/lib/utils';

interface Hint {
  id?: string;
  order?: number;
  content: string;
  xp_penalty: number;
}

interface HintDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hints: Hint[];
}

export function HintDrawer({ open, onOpenChange, hints = [] }: HintDrawerProps) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleRevealClick = (hintId: string) => {
    setConfirmingId(hintId);
  };

  const confirmReveal = () => {
    if (confirmingId) {
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.add(confirmingId);
        return next;
      });
      setConfirmingId(null);
    }
  };

  const sortedHints = hints
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto border-l bg-background">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <Lightbulb className="size-5 text-amber-500 fill-amber-500/20" />
            Hints & Help
          </SheetTitle>
          <SheetDescription>
            Unlock hints to help solve the problem. Each hint carries a score or XP penalty.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          {sortedHints.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground text-sm">
              <HelpCircle className="size-8 text-muted-foreground/50 mb-2" />
              No hints available for this challenge.
            </div>
          ) : (
            sortedHints.map((hint, index) => {
              const hintId = hint.id ?? `hint_${index}`;
              const isRevealed = revealedIds.has(hintId);
              const isConfirming = confirmingId === hintId;

              return (
                <div
                  key={hintId}
                  className={cn(
                    'rounded-lg border transition-all duration-200',
                    isRevealed
                      ? 'border-border bg-card/60 shadow-xs'
                      : 'border-muted bg-muted/20 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-semibold text-foreground">
                        Hint {index + 1}
                      </h4>
                      <p className="text-xs text-amber-600 font-medium">
                        -{hint.xp_penalty} XP penalty
                      </p>
                    </div>

                    {!isRevealed && !isConfirming && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevealClick(hintId)}
                        className="gap-1.5 h-8 text-xs font-semibold"
                      >
                        <Lock className="size-3.5 text-muted-foreground" />
                        Reveal
                      </Button>
                    )}
                  </div>

                  {isConfirming && (
                    <div className="bg-amber-500/10 border-t border-amber-500/20 p-4 space-y-3">
                      <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                        Are you sure you want to reveal Hint {index + 1}? Doing so will deduct {hint.xp_penalty} XP from your potential score.
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setConfirmingId(null)}
                          className="h-7 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          onClick={confirmReveal}
                          className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs font-semibold"
                        >
                          Unlock (-{hint.xp_penalty} XP)
                        </Button>
                      </div>
                    </div>
                  )}

                  {isRevealed && (
                    <div className="border-t px-4 py-3.5 bg-background">
                      <MarkdownRenderer
                        content={hint.content}
                        className="text-sm text-foreground/90 prose-sm"
                        compact
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
