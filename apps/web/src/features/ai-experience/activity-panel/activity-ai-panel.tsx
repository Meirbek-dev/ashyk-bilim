'use client'

import { BotIcon, ShieldCheckIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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

export function ActivityAIPanel({ children, className, scope }: ActivityAIPanelProps) {
  const isMobile = useIsMobile()
  const t = useTranslations('Activities.AiAssistantPanel')
  const defaultMode: ActivityAIMode = scope.surface === 'student-activity' ? 'ask' : 'review'
  const { open, setOpen } = useActivityAIUrlState(defaultMode)
  const capabilities = useAIScopeCapabilities(scope)
  const visibility = capabilities.data?.context_visibility ?? 'student'
  const modes = useMemo(() => capabilities.data?.modes ?? [defaultMode], [capabilities.data?.modes, defaultMode])

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
          <PanelBody className={className} modes={modes} visibility={visibility}>
            {children}
          </PanelBody>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          'top-14 h-[calc(100dvh-3.5rem)] w-[min(28rem,calc(100vw-2rem))] gap-0 p-0 sm:max-w-none',
          className,
        )}
      >
        <SheetHeader className="border-b pe-12">
          <SheetTitle className="flex items-center gap-2">
            <BotIcon data-icon="inline-start" aria-hidden="true" />
            {t('title')}
          </SheetTitle>
          <SheetDescription>{t('contextDescription')}</SheetDescription>
        </SheetHeader>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute end-3 top-3"
          aria-label={t('closePanel')}
          onClick={() => setOpen(false)}
        >
          <XIcon aria-hidden="true" />
        </Button>
        <PanelBody modes={modes} visibility={visibility}>
          {children}
        </PanelBody>
      </SheetContent>
    </Sheet>
  )
}

function PanelBody({
  children,
  className,
  modes,
  visibility,
}: {
  children: React.ReactNode
  className?: string | undefined
  modes: ActivityAIMode[]
  visibility: 'student' | 'teacher' | 'admin'
}) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const { mode, setMode } = useActivityAIUrlState()
  const activeMode = modes.includes(mode) ? mode : (modes[0] ?? 'ask')

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            {visibility === 'student' ? t('studentMode') : visibility}
          </Badge>
          <span className="text-muted-foreground text-xs">{t('approvalBoundary')}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={t('title')}>
          {modes.map(item => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={activeMode === item ? 'default' : 'ghost'}
              role="tab"
              aria-selected={activeMode === item}
              tabIndex={0}
              onClick={() => setMode(item)}
            >
              {MODE_LABELS[item]}
            </Button>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col gap-4 p-4" aria-live="polite">
          {children}
        </div>
      </ScrollArea>
    </div>
  )
}
