import { ArrowRight, BarChart3, BookOpen, BriefcaseBusiness, CheckCircle2, Inbox, ShieldCheck } from 'lucide-react'

import AppLink from '@/components/ui/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { LmsStatusBadge } from '@/features/lms-status'

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

        <div className="grid gap-4 xl:grid-cols-2">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

  return (
    <Card data-testid={`work-queue-${section.audience}`}>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>{section.title}</CardTitle>
            <CardDescription className="text-pretty">{section.description}</CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge variant="outline">{section.items.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {section.items.length > 0 ? (
          <div className="flex flex-col gap-3">
            {section.items.map(item => (
              <WorkQueueCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <WorkQueueEmpty section={section} />
        )}
      </CardContent>
    </Card>
  )
}

function WorkQueueCard({ item }: { item: WorkQueueItem }) {
  return (
    <article
      className="bg-background flex min-w-0 flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
      data-testid={`work-queue-item-${item.id}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <LmsStatusBadge status={item.status} />
          <Badge variant="outline">{item.sourceLabel}</Badge>
          {item.metric ? (
            <Badge variant="secondary" className="font-mono tabular-nums">
              {item.metric.value} {item.metric.label}
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-semibold text-pretty">{item.title}</h3>
          <p className="text-muted-foreground text-sm/relaxed text-pretty">{item.description}</p>
        </div>
      </div>
      <Button nativeButton={false} render={<AppLink href={item.href} />} className="md:self-end">
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
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{tool.title}</CardTitle>
        <CardDescription className="text-pretty">{tool.description}</CardDescription>
        {tool.badge ? (
          <CardAction>
            <Badge variant="outline">{tool.badge}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <Button variant="outline" nativeButton={false} render={<AppLink href={tool.href} />}>
          {openLabel}
          <BarChart3 data-icon="inline-end" aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  )
}
