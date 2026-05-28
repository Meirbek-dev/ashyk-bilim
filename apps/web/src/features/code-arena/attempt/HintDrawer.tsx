'use client'

import { Lightbulb, Lock, HelpCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MarkdownContent } from '@/features/content-markdown'
import { cn } from '@/lib/utils'

interface Hint {
  id?: string
  order?: number
  content: string
  xp_penalty: number
}

interface HintDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hints: Hint[]
}

export function HintDrawer({ open, onOpenChange, hints }: HintDrawerProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set())
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const handleRevealClick = (hintId: string) => {
    setConfirmingId(hintId)
  }

  const confirmReveal = () => {
    if (confirmingId) {
      setRevealedIds(prev => {
        const next = new Set(prev)
        next.add(confirmingId)
        return next
      })
      setConfirmingId(null)
    }
  }

  const sortedHints = [...hints].toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-background w-full overflow-y-auto border-l sm:max-w-md">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <Lightbulb className="size-5 fill-amber-500/20 text-amber-500" />
            {t('hintsAndHelp')}
          </SheetTitle>
          <SheetDescription>{t('unlockHintsDescription')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pt-2">
          {sortedHints.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-sm">
              <HelpCircle className="text-muted-foreground/50 mb-2 size-8" />
              {t('noHintsAvailable')}
            </div>
          ) : (
            sortedHints.map((hint, index) => {
              const hintId = hint.id ?? `hint_${index}`
              const isRevealed = revealedIds.has(hintId)
              const isConfirming = confirmingId === hintId

              return (
                <div
                  key={hintId}
                  className={cn(
                    'rounded-lg border transition-all duration-200',
                    isRevealed ? 'border-border bg-card/60 shadow-xs' : 'border-muted bg-muted/20 hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="space-y-0.5">
                      <h4 className="text-foreground text-sm font-semibold">
                        {t('hintNumber', { number: index + 1 })}
                      </h4>
                      <p className="text-xs font-medium text-amber-600">
                        {t('xpPenaltyValue', { penalty: hint.xp_penalty })}
                      </p>
                    </div>

                    {!isRevealed && !isConfirming && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevealClick(hintId)}
                        className="h-8 gap-1.5 text-xs font-semibold"
                      >
                        <Lock className="text-muted-foreground size-3.5" />
                        {t('reveal')}
                      </Button>
                    )}
                  </div>

                  {isConfirming && (
                    <div className="space-y-3 border-t border-amber-500/20 bg-amber-500/10 p-4">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                        {t('revealConfirm', {
                          number: index + 1,
                          penalty: hint.xp_penalty,
                        })}
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setConfirmingId(null)}
                          className="h-7 text-xs"
                        >
                          {t('cancel')}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          onClick={confirmReveal}
                          className="h-7 bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          {t('unlockWithPenalty', { penalty: hint.xp_penalty })}
                        </Button>
                      </div>
                    </div>
                  )}

                  {isRevealed && (
                    <div className="bg-background border-t px-4 py-3.5">
                      <MarkdownContent
                        content={hint.content}
                        className="text-foreground/90 prose-sm text-sm"
                        mode="compactRichText"
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
