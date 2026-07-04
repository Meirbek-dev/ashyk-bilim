'use client'

import { BotIcon, BookOpenCheckIcon, PanelRightCloseIcon, ShieldCheckIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import { useActivityAIUrlState } from './activity-ai-url-state'
import type { ActivityAIMode } from './activity-ai-url-state'
import { useAIScopeCapabilities } from './use-ai-scope-capabilities'
import type { AIScope } from './use-ai-scope-capabilities'

interface ActivityAIPanelProps {
  children: React.ReactNode
  className?: string | undefined
  scope: AIScope
}

const MODE_LABELS: Record<ActivityAIMode, string> = {
  ask: 'Ask',
  explain: 'Explain',
  practice: 'Practice',
  sources: 'Sources',
  review: 'Review',
  analyze: 'Analyze',
  'draft-feedback': 'Draft feedback',
  remediation: 'Remediation',
}

type ActivityAILayout = 'compact' | 'wide'

export function getAIModeLayout(mode: ActivityAIMode, surface: AIScope['surface']): ActivityAILayout {
  if (surface === 'admin') return 'wide'
  if (mode === 'review' || mode === 'analyze' || mode === 'draft-feedback' || mode === 'remediation') return 'wide'
  return 'compact'
}

export function getActivityAIDockWidth(layout: ActivityAILayout) {
  return layout === 'wide' ? 'min(48rem, 46vw)' : 'min(26rem, calc(100vw - 2rem))'
}

export function useActivityAIDockStyle({
  defaultMode,
  enabled = true,
  surface,
}: {
  defaultMode: ActivityAIMode
  enabled?: boolean | undefined
  surface: AIScope['surface']
}): CSSProperties | undefined {
  const isMobile = useIsMobile()
  const { mode, open } = useActivityAIUrlState(defaultMode)
  const layout = getAIModeLayout(mode, surface)

  return useMemo(() => {
    if (!enabled || !open || isMobile) return undefined
    return {
      paddingInlineEnd: `calc(${getActivityAIDockWidth(layout)} + 1rem)`,
    }
  }, [enabled, isMobile, layout, open])
}

export function ActivityAIPanel({ children, className, scope }: ActivityAIPanelProps) {
  const isMobile = useIsMobile()
  const t = useTranslations('Activities.AiAssistantPanel')
  const defaultMode: ActivityAIMode = scope.surface === 'student-activity' ? 'ask' : 'review'
  const { mode, open, setOpen } = useActivityAIUrlState(defaultMode)
  const capabilities = useAIScopeCapabilities(scope)
  const visibility = capabilities.data?.context_visibility ?? 'student'
  const modes = useMemo(() => capabilities.data?.modes ?? [defaultMode], [capabilities.data?.modes, defaultMode])
  const activeMode = modes.includes(mode) ? mode : (modes[0] ?? defaultMode)
  const layout = getAIModeLayout(activeMode, scope.surface)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])

  function closePanel() {
    setOpen(false)
    globalThis.requestAnimationFrame(() => restoreFocusRef.current?.focus())
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} direction="bottom">
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader className="border-b text-left">
            <DrawerTitle className="flex items-center gap-2">
              <BotIcon data-icon="inline-start" aria-hidden="true" />
              {t('title')}
            </DrawerTitle>
            <DrawerDescription>{t('contextDescription')}</DrawerDescription>
          </DrawerHeader>
          <PanelBody className={className} layout="compact" modes={modes} scope={scope} visibility={visibility}>
            {children}
          </PanelBody>
        </DrawerContent>
      </Drawer>
    )
  }

  if (!open) return null

  return (
    <aside
      aria-label={t('title')}
      data-ai-layout={layout}
      className={cn(
        'bg-background text-foreground fixed end-0 top-14 bottom-0 z-40 flex min-h-0 border-s shadow-lg',
        'w-[min(26rem,calc(100vw-2rem))] data-[ai-layout=wide]:w-[min(48rem,46vw)]',
        className,
      )}
      onKeyDown={event => {
        if (event.key === 'Escape') closePanel()
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading flex min-w-0 items-center gap-2 text-base font-medium">
              <BotIcon data-icon="inline-start" aria-hidden="true" />
              <span className="truncate">{t('title')}</span>
            </h2>
            <p className="text-muted-foreground text-sm leading-normal">{t('contextDescription')}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('closePanel')} onClick={closePanel}>
            <PanelRightCloseIcon aria-hidden="true" />
          </Button>
        </div>
        <PanelBody layout={layout} modes={modes} scope={scope} visibility={visibility}>
          {children}
        </PanelBody>
      </div>
    </aside>
  )
}

function PanelBody({
  children,
  className,
  layout,
  modes,
  scope,
  visibility,
}: {
  children: React.ReactNode
  className?: string | undefined
  layout: ActivityAILayout
  modes: ActivityAIMode[]
  scope: AIScope
  visibility: 'student' | 'teacher' | 'admin'
}) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const { mode, setMode } = useActivityAIUrlState(scope.surface === 'student-activity' ? 'ask' : 'review')
  const activeMode = modes.includes(mode) ? mode : (modes[0] ?? 'ask')
  const sourceCount = modes.length

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)} data-ai-layout={layout}>
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            {visibility === 'student' ? t('studentMode') : visibility}
          </Badge>
          <Badge variant="outline">
            <BookOpenCheckIcon data-icon="inline-start" aria-hidden="true" />
            {t('sourcesAvailable', { count: sourceCount })}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs leading-normal">{t('approvalBoundary')}</p>
        <Separator />
        <ScrollArea className="max-w-full">
          <ToggleGroup
            aria-label={t('title')}
            className="w-max"
            size="sm"
            value={[activeMode]}
            onValueChange={value => {
              const nextMode = value[0] as ActivityAIMode | undefined
              if (nextMode) setMode(nextMode)
            }}
          >
            {modes.map(item => (
              <ToggleGroupItem key={item} value={item}>
                {MODE_LABELS[item]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </ScrollArea>
      </div>
      <ScrollArea className="min-h-0 flex-1 overscroll-contain">
        <div
          className={cn('flex min-h-full flex-col gap-4 p-4', layout === 'wide' ? 'max-w-none' : 'max-w-[30rem]')}
          aria-live="polite"
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  )
}
