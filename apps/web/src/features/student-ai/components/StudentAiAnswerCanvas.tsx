'use client'

import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  CopyIcon,
  FileWarningIcon,
  FlagIcon,
  LightbulbIcon,
  RotateCcwIcon,
  SaveIcon,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import type { StudentAiOutput } from '../types'
import { StudentAiHintLadder } from './StudentAiHintLadder'
import { StudentAiPracticeSet } from './StudentAiPracticeSet'

const ANSWER_CANVAS_COPY = {
  checklist: 'Checklist',
  copy: 'Copy',
  keyIdea: 'Key idea',
  nextStep: 'Next step',
  regenerate: 'Regenerate',
  report: 'Report',
  save: 'Save',
  sourcesUsed: 'Sources used',
  startMode: 'Start with this mode',
  studyResponse: 'Study response',
}

export function StudentAiAnswerCanvas({
  onCopy,
  onRegenerate,
  onReport,
  onSave,
  output,
}: {
  onCopy: () => void
  onRegenerate: () => void
  onReport: () => void
  onSave: () => void
  output: StudentAiOutput
}) {
  if (output.kind === 'empty') {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LightbulbIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{output.title}</EmptyTitle>
          <EmptyDescription>{output.summary}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={onRegenerate}>
            {ANSWER_CANVAS_COPY.startMode}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (output.kind === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{output.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (output.kind === 'refusal') {
    return (
      <Alert variant="destructive">
        <FileWarningIcon aria-hidden="true" />
        <AlertTitle>{output.title}</AlertTitle>
        <AlertDescription>
          <p>{output.summary}</p>
          {output.body ? <p>{output.body}</p> : null}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {output.title}
          {output.confidence !== undefined && output.confidence !== null ? (
            <Badge variant="secondary">{Math.round(output.confidence * 100)}% confidence</Badge>
          ) : null}
        </CardTitle>
        <CardAction>
          <Badge variant={output.kind === 'practice_set' ? 'secondary' : 'outline'}>{labelForKind(output.kind)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-4">
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2Icon aria-hidden="true" className="text-primary size-4" />
            {ANSWER_CANVAS_COPY.keyIdea}
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{output.summary}</p>
        </section>

        {output.body ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardCheckIcon aria-hidden="true" className="text-primary size-4" />
              {ANSWER_CANVAS_COPY.studyResponse}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{output.body}</p>
          </section>
        ) : null}

        {output.practiceItems?.length ? <StudentAiPracticeSet items={output.practiceItems} /> : null}
        {output.hintSteps?.length ? <StudentAiHintLadder steps={output.hintSteps} /> : null}
        {output.checklist?.length ? <Checklist items={output.checklist} /> : null}

        {output.nextAction ? (
          <Alert>
            <FlagIcon aria-hidden="true" />
            <AlertTitle>{ANSWER_CANVAS_COPY.nextStep}</AlertTitle>
            <AlertDescription>{output.nextAction}</AlertDescription>
          </Alert>
        ) : null}

        {output.citations.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">{ANSWER_CANVAS_COPY.sourcesUsed}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {output.citations.slice(0, 4).map(citation => (
                <div key={citation.id} className="border-border/70 rounded-lg border p-2">
                  <p className="truncate text-xs font-medium">{citation.label}</p>
                  <p className="text-muted-foreground line-clamp-3 text-xs">{citation.excerpt}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCopy}>
            <CopyIcon data-icon="inline-start" />
            {ANSWER_CANVAS_COPY.copy}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSave}>
            <SaveIcon data-icon="inline-start" />
            {ANSWER_CANVAS_COPY.save}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onReport}>
            {ANSWER_CANVAS_COPY.report}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRegenerate}>
            <RotateCcwIcon data-icon="inline-start" />
            {ANSWER_CANVAS_COPY.regenerate}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

function Checklist({ items }: { items: string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{ANSWER_CANVAS_COPY.checklist}</h4>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map(item => (
          <li key={item} className="border-border/70 flex items-start gap-2 rounded-lg border p-2 text-sm">
            <CheckCircle2Icon aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function labelForKind(kind: StudentAiOutput['kind']) {
  switch (kind) {
    case 'code_diagnosis': {
      return 'debug'
    }
    case 'explanation': {
      return 'explain'
    }
    case 'hint_ladder': {
      return 'hints'
    }
    case 'practice_set': {
      return 'practice'
    }
    case 'reflection': {
      return 'reflect'
    }
    case 'submission_checklist': {
      return 'submit'
    }
    case 'empty':
    case 'loading':
    case 'refusal': {
      return kind
    }
  }
}
