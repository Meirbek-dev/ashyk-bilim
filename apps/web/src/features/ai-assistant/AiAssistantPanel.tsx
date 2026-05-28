'use client'

import { useTranslations } from 'next-intl'
import { Bot, X, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'

interface AiAssistantPanelProps {
  open: boolean
  onClose: () => void
  runtime: StudentActivityRuntime
}

/**
 * AiAssistantPanel
 *
 * A contextual AI assistant panel that slides in from the right side.
 * Always position:fixed — zero DOM-flow impact.
 *
 * Closed: translate-x-full + opacity-0 + pointer-events-none
 * Open:   translate-x-0 + opacity-100 (400px panel from right)
 *
 * Context-aware: provides relevant prompt suggestions based on the current
 * activity type.
 *
 * Triggered by the [AI] button in ActivityHeader.
 * Dismisses on close button, Escape key (handled by StudentActivityWorkspace),
 * or click-outside backdrop.
 */
export default function AiAssistantPanel({ open, onClose, runtime }: AiAssistantPanelProps) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const activityType = runtime.activity?.type ?? ''
  const suggestions = getSuggestions(activityType, t)

  return (
    <>
      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed right-0 top-14 z-30',
          'h-[calc(100dvh-3.5rem)] w-[min(400px,100vw)]',
          'flex flex-col border-l border-border bg-background shadow-xl',
          'transition-[transform,opacity] duration-200 ease-out will-change-transform',
          open ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none',
        )}
        role="complementary"
        aria-label={t('title')}
      >
        {/* Header */}
        <div className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            <span className="text-sm font-semibold">{t('title')}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('title')}
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Suggestions */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              {t('suggestedPrompts')}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {suggestions.map((suggestion, i) => (
              <Button
                key={i}
                type="button"
                variant="outline"
                className="h-auto justify-start rounded-lg p-3 text-left text-sm font-normal"
              >
                {suggestion}
              </Button>
            ))}
          </div>

          {/* Activity context info */}
          {runtime.activity ? (
            <div className="border-border bg-muted/30 mt-6 rounded-lg border p-3">
              <p className="text-muted-foreground mb-1 text-xs font-medium">
                {t('currentActivity')}
              </p>
              <p className="text-sm font-medium">{runtime.activity.title}</p>
            </div>
          ) : null}
        </div>

        {/* Chat input placeholder */}
        <div className="border-border border-t p-4">
          <div className="border-border bg-muted/30 flex items-center gap-2 rounded-lg border p-3">
            <Bot className="text-muted-foreground size-4 shrink-0" />
            <span className="text-muted-foreground text-sm">{t('askPlaceholder')}</span>
          </div>
        </div>
      </div>

      {/* Click-outside backdrop */}
      {open ? <div className="fixed inset-0 z-20" aria-hidden onClick={onClose} /> : null}
    </>
  )
}

// ── Context-aware suggestions ─────────────────────────────────────────────────

function getSuggestions(activityType: string, t: any): string[] {
  switch (activityType) {
    case 'TYPE_DYNAMIC': {
      return [
        t('suggestions.dynamic.summarize'),
        t('suggestions.dynamic.explain'),
        t('suggestions.dynamic.takeaways'),
        t('suggestions.dynamic.quiz'),
      ]
    }
    case 'TYPE_CODE_CHALLENGE': {
      return [
        t('suggestions.code.hint'),
        t('suggestions.code.testcases'),
        t('suggestions.code.algorithm'),
        t('suggestions.code.error'),
      ]
    }
    case 'TYPE_EXAM':
    case 'TYPE_CUSTOM': {
      return [
        t('suggestions.exam.hint'),
        t('suggestions.exam.concept'),
        t('suggestions.exam.review'),
      ]
    }
    case 'TYPE_FILE_SUBMISSION': {
      return [
        t('suggestions.file.include'),
        t('suggestions.file.criteria'),
        t('suggestions.file.structure'),
      ]
    }
    case 'TYPE_VIDEO': {
      return [
        t('suggestions.video.summarize'),
        t('suggestions.video.explain'),
        t('suggestions.video.keypoints'),
      ]
    }
    default: {
      return [
        t('suggestions.default.understand'),
        t('suggestions.default.concepts'),
        t('suggestions.default.guidance'),
      ]
    }
  }
}
