'use client'

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Inbox,
  ShieldCheck,
} from 'lucide-react'
import { useLocale } from 'next-intl'

import AppLink from '@/components/ui/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { LmsStatusBadge } from '@/features/lms-status'
import { cn } from '@/lib/utils'

import type { DashboardToolItem, WorkQueueAudience, WorkQueueItem, WorkQueueSection } from '../types'

interface DashboardWorkQueueProps {
  sections: WorkQueueSection[]
  tools: DashboardToolItem[]
  copy: DashboardWorkQueueCopy
}

interface DashboardWorkQueueCopy {
  priorityLabel: string
  title: string
  description: string
  browseLabel: string
  toolsTitle: string
  toolsDescription: string
  openLabel: string
}

const audienceIcon = {
  learner: BookOpen,
  teacher: BriefcaseBusiness,
  admin: ShieldCheck,
} satisfies Record<WorkQueueAudience, typeof BookOpen>

export function DashboardWorkQueue({ sections, tools, copy }: DashboardWorkQueueProps) {
  return (
    <div className="flex flex-col gap-8" data-testid="dashboard-work-queue">
      <section aria-labelledby="dashboard-work-queue-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">{copy.priorityLabel}</p>
          <h2
            id="dashboard-work-queue-title"
            className="font-heading text-2xl font-semibold tracking-tight text-balance"
          >
            {copy.title}
          </h2>
          <p className="text-muted-foreground max-w-3xl text-sm/relaxed">{copy.description}</p>
        </div>

        <div className="divide-border border-y">
          {sections.map(section => (
            <WorkQueueSectionView key={section.audience} section={section} />
          ))}
        </div>
      </section>

      <Separator />

      <section aria-labelledby="dashboard-tools-title" className="flex flex-col gap-4" data-testid="dashboard-tools">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">{copy.browseLabel}</p>
          <h2 id="dashboard-tools-title" className="font-heading text-lg font-semibold tracking-tight">
            {copy.toolsTitle}
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm/relaxed">{copy.toolsDescription}</p>
        </div>
        <div className="divide-border grid border-y md:grid-cols-2 md:divide-x lg:grid-cols-3">
          {tools.map(tool => (
            <DashboardToolCard key={tool.id} tool={tool} openLabel={copy.openLabel} />
          ))}
        </div>
      </section>
    </div>
  )
}

function WorkQueueSectionView({ section }: { section: WorkQueueSection }) {
  const Icon = audienceIcon[section.audience]
  const groups = groupQueueItems(section.items)

  return (
    <section className="py-6 first:pt-5 last:pb-5" data-testid={`work-queue-${section.audience}`}>
      <header className="flex items-start justify-between gap-4 px-1 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
            <Icon aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{section.title}</h3>
            <p className="text-muted-foreground mt-0.5 text-sm text-pretty">{section.description}</p>
          </div>
        </div>
        <Badge variant="outline" className="font-mono tabular-nums">
          {section.items.length}
        </Badge>
      </header>
      {section.items.length > 0 ? (
        <div className="border-y">
          {groups.map(group => (
            <section key={group.label ?? 'all'} aria-label={group.label ?? undefined}>
              {group.label ? (
                <h4 className="bg-muted/40 text-muted-foreground border-b px-3 py-2 text-xs font-medium">
                  {group.label}
                </h4>
              ) : null}
              <div className="divide-border divide-y">
                {group.items.map(item => (
                  <WorkQueueRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <WorkQueueEmpty section={section} />
      )}
    </section>
  )
}

function groupQueueItems(items: WorkQueueItem[]) {
  const groups = new Map<string | null, WorkQueueItem[]>()
  for (const item of items) {
    const label = item.groupLabel ?? null
    const group = groups.get(label) ?? []
    group.push(item)
    groups.set(label, group)
  }
  return [...groups].map(([label, groupItems]) => ({ label, items: groupItems }))
}

function WorkQueueRow({ item }: { item: WorkQueueItem }) {
  const locale = useLocale()
  const timestamp = item.dueAt ?? item.createdAt

  return (
    <article
      className={cn(
        'grid min-w-0 gap-4 border-l-2 border-l-transparent px-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
        item.priority === 'critical' && 'border-l-destructive bg-destructive/3',
        item.priority === 'high' && 'border-l-amber-500 bg-amber-500/3',
      )}
      data-testid={`work-queue-item-${item.id}`}
    >
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)] lg:items-center lg:gap-5">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-pretty">{item.title}</h4>
          <p className="text-muted-foreground mt-1 text-xs">{item.sourceLabel}</p>
          {timestamp ? (
            <time className="text-muted-foreground mt-1 flex items-center gap-1 text-xs" dateTime={timestamp}>
              <CalendarClock className="size-3.5" aria-hidden />
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(timestamp))}
            </time>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm/relaxed text-pretty">{item.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LmsStatusBadge status={item.status} />
            {item.metric ? (
              <Badge variant="secondary" className="font-mono tabular-nums">
                {item.metric.value} {item.metric.label}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      <Button nativeButton={false} render={<AppLink href={item.href} />} className="w-full sm:w-auto">
        {item.primaryActionLabel}
        <ArrowRight data-icon="inline-end" aria-hidden="true" />
      </Button>
    </article>
  )
}

function WorkQueueEmpty({ section }: { section: WorkQueueSection }) {
  return (
    <Empty className="min-h-56 border" data-testid={`work-queue-empty-${section.audience}`}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{section.emptyTitle}</EmptyTitle>
        <EmptyDescription>{section.emptyDescription}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <CheckCircle2 aria-hidden="true" />
      </EmptyContent>
    </Empty>
  )
}

function DashboardToolCard({ tool, openLabel }: { tool: DashboardToolItem; openLabel: string }) {
  return (
    <article className="flex min-w-0 flex-col justify-between gap-4 p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold">{tool.title}</h3>
          {tool.badge ? <Badge variant="outline">{tool.badge}</Badge> : null}
        </div>
        <p className="text-muted-foreground mt-1 text-sm text-pretty">{tool.description}</p>
      </div>
      <Button variant="ghost" nativeButton={false} render={<AppLink href={tool.href} />} className="self-start px-0">
        {openLabel}
        <BarChart3 data-icon="inline-end" aria-hidden="true" />
      </Button>
    </article>
  )
}
