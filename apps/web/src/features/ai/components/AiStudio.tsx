'use client'

import type { ReactNode } from 'react'
import {
  ActivityIcon,
  BookOpenTextIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  RadioTowerIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { AiArtifact, AiStreamEvent, EvidenceCitation, ToolProgressEvent } from '../api/ai-event-contract'

interface AiStudioShellProps {
  children: ReactNode
  className?: string
}

interface AiStudioContextMapProps {
  title: string
  description: string
  citations: EvidenceCitation[]
  latestArtifact?: AiArtifact | null
  statusMessage?: string | null
}

interface AiStudioMainProps {
  children: ReactNode
  className?: string
}

interface AiStudioRunConsoleProps {
  events: AiStreamEvent[]
  toolEvents: ToolProgressEvent[]
  statusMessage?: string | null
  isLoading?: boolean
}

function Shell({ children, className }: AiStudioShellProps) {
  const t = useTranslations('Activities.AiStudio')
  return (
    <section
      className={cn(
        'bg-background grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden lg:grid-cols-[18rem_minmax(0,1fr)_20rem] lg:grid-rows-1',
        className,
      )}
      aria-label={t('shellAriaLabel')}
    >
      {children}
    </section>
  )
}

function ContextMap({ title, description, citations, latestArtifact, statusMessage }: AiStudioContextMapProps) {
  const t = useTranslations('Activities.AiStudio')
  return (
    <aside
      className="bg-muted/30 flex min-h-0 flex-col border-b lg:border-r lg:border-b-0"
      aria-label={t('learningContextAria')}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-md border">
            <BookOpenTextIcon aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="text-muted-foreground line-clamp-2 text-xs">{description}</p>
          </div>
        </div>
        {statusMessage && (
          <div className="flex items-center gap-2 text-xs" aria-live="polite">
            <RadioTowerIcon className="text-primary" aria-hidden="true" />
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{statusMessage}</span>
          </div>
        )}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <section className="flex flex-col gap-2" aria-label={t('currentArtifactAria')}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium">{t('artifactTitle')}</h3>
              <Badge variant={latestArtifact ? 'secondary' : 'outline'}>{latestArtifact?.kind ?? t('waiting')}</Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {latestArtifact?.summary ?? t('defaultSummary')}
            </p>
          </section>
          <section className="flex flex-col gap-2" aria-label={t('evidenceMapAria')}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium">{t('evidenceTitle')}</h3>
              <Badge variant="outline">{citations.length}</Badge>
            </div>
            {citations.length > 0 ? (
              <div className="flex flex-col gap-2">
                {citations.slice(0, 4).map(citation => (
                  <figure key={citation.id} className="bg-background flex flex-col gap-1 rounded-md border p-2">
                    <figcaption className="truncate text-xs font-medium">{citation.label}</figcaption>
                    <blockquote className="text-muted-foreground line-clamp-3 text-xs">{citation.excerpt}</blockquote>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">{t('noCitations')}</p>
            )}
          </section>
        </div>
      </ScrollArea>
    </aside>
  )
}

function Main({ children, className }: AiStudioMainProps) {
  return <main className={cn('grid min-h-0 grid-rows-[minmax(0,1fr)_auto]', className)}>{children}</main>
}

function RunConsole({ events, toolEvents, statusMessage, isLoading = false }: AiStudioRunConsoleProps) {
  const t = useTranslations('Activities.AiStudio')
  const visibleEvents = events.slice(-8)
  const latestRun = visibleEvents.at(-1)

  return (
    <aside className="bg-muted/20 flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l" aria-label={t('aiRunConsoleAria')}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ActivityIcon className="text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('runConsoleTitle')}</h2>
          </div>
          <Badge variant={isLoading ? 'default' : 'outline'}>{isLoading ? t('live') : t('idle')}</Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          {statusMessage ?? latestRun?.type ?? t('defaultConsoleStatus')}
        </p>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          <section className="flex flex-col gap-2" aria-label={t('toolTimelineAria')}>
            <h3 className="text-xs font-medium">{t('toolsTitle')}</h3>
            {toolEvents.length > 0 ? (
              toolEvents.slice(-5).map(event => (
                <div
                  key={event.event_id}
                  className="bg-background flex items-center gap-2 rounded-md border p-2 text-xs"
                >
                  {event.payload.status === 'complete' ? (
                    <CheckCircle2Icon className="text-primary" aria-hidden="true" />
                  ) : (
                    <Loader2Icon className="text-muted-foreground animate-spin" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{event.payload.label}</span>
                  <Badge variant={event.payload.status === 'complete' ? 'secondary' : 'outline'}>
                    {event.payload.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">{t('noTools')}</p>
            )}
          </section>
          <section className="flex flex-col gap-2" aria-label={t('eventSequenceAria')}>
            <h3 className="text-xs font-medium">{t('eventsTitle')}</h3>
            {visibleEvents.length > 0 ? (
              visibleEvents.map(event => (
                <div key={event.event_id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{event.sequence}</Badge>
                  <span className="min-w-0 flex-1 truncate">{event.type}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">{t('nextRunStream')}</p>
            )}
          </section>
          <section className="bg-background flex flex-col gap-2 rounded-md border p-3" aria-label={t('trustControlsAria')}>
            <div className="flex items-center gap-2 text-xs font-medium">
              <ShieldCheckIcon className="text-primary" aria-hidden="true" />
              {t('approvalBoundary')}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('approvalBoundaryDesc')}
            </p>
          </section>
        </div>
      </ScrollArea>
    </aside>
  )
}

function ArtifactCanvas({ children, className }: AiStudioMainProps) {
  const t = useTranslations('Activities.AiStudio')
  return (
    <section className={cn('bg-background border-t p-3', className)} aria-label={t('artifactCanvasAria')}>
      <div className="flex items-center gap-2 pb-2 text-xs font-medium">
        <FileTextIcon className="text-primary" aria-hidden="true" />
        {t('artifactCanvasTitle')}
      </div>
      {children}
    </section>
  )
}

export const AiStudio = {
  ArtifactCanvas,
  ContextMap,
  Main,
  RunConsole,
  Shell,
}
