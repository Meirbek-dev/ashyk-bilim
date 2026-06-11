'use client'

import { FileTextIcon, LightbulbIcon, ShieldAlertIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownContent } from '@/features/content-markdown'
import type { AiArtifact } from '../api/ai-event-contract'

export interface AiArtifactRendererProps {
  artifact?: AiArtifact | null
}

export function AiArtifactRenderer({ artifact }: AiArtifactRendererProps) {
  if (!artifact) return null

  return (
    <Card className="rounded-lg border-dashed shadow-none">
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
            <FileTextIcon className="text-primary size-4" aria-hidden="true" />
            <span className="truncate">{titleForArtifact(artifact)}</span>
          </CardTitle>
          <Badge variant="outline">{Math.round(artifact.confidence * 100)}%</Badge>
        </div>
        <CardDescription>{artifact.summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{renderArtifactContent(artifact)}</CardContent>
    </Card>
  )
}

function titleForArtifact(artifact: AiArtifact): string {
  switch (artifact.kind) {
    case 'flashcard_set': {
      return 'Flashcards'
    }
    case 'hint_ladder': {
      return 'Hint ladder'
    }
    case 'code_review_hint': {
      return 'Code mentor hint'
    }
    case 'authoring_patch': {
      return 'Authoring patch'
    }
    case 'rubric_feedback': {
      return 'Rubric feedback'
    }
    case 'teacher_intervention': {
      return 'Teacher intervention'
    }
    case 'safety_refusal': {
      return 'Safety response'
    }
    case 'tutor_answer': {
      return 'Tutor answer'
    }
  }
}

function renderArtifactContent(artifact: AiArtifact) {
  switch (artifact.kind) {
    case 'tutor_answer': {
      return <MarkdownContent content={artifact.content} mode="compactRichText" />
    }
    case 'flashcard_set': {
      return (
        <div className="flex flex-col gap-2">
          {artifact.cards.map((card, index) => (
            <div key={`${card.front}-${index}`} className="rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <strong>{card.front}</strong>
                <Badge variant="secondary">{card.difficulty}</Badge>
              </div>
              <p className="text-muted-foreground">{card.back}</p>
            </div>
          ))}
        </div>
      )
    }
    case 'hint_ladder': {
      return (
        <ol className="flex flex-col gap-2">
          {artifact.steps.map(step => (
            <li key={step.level} className="flex gap-2 rounded-md border p-3">
              <Badge variant="outline">{step.level}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{step.title}</div>
                <p className="text-muted-foreground">{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      )
    }
    case 'code_review_hint': {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-medium">
            <LightbulbIcon className="text-primary size-4" aria-hidden="true" />
            {artifact.issue}
          </div>
          <p className="text-muted-foreground">{artifact.next_step}</p>
        </div>
      )
    }
    case 'authoring_patch': {
      return (
        <div className="flex flex-col gap-3">
          <MarkdownContent content={artifact.patch_markdown} mode="compactRichText" />
          {artifact.risk_labels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {artifact.risk_labels.map(label => (
                <Badge key={label} variant="warning">
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'rubric_feedback': {
      return <MarkdownContent content={artifact.feedback} mode="compactRichText" />
    }
    case 'teacher_intervention': {
      return (
        <div className="flex flex-col gap-2">
          <p>{artifact.cohort_summary}</p>
          <MarkdownContent content={artifact.intervention_draft} mode="compactRichText" />
          {artifact.privacy_notes.map(note => (
            <Badge key={note} variant="outline">
              {note}
            </Badge>
          ))}
        </div>
      )
    }
    case 'safety_refusal': {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlertIcon className="text-destructive size-4" aria-hidden="true" />
            {artifact.reason}
          </div>
          <p className="text-muted-foreground">{artifact.recovery}</p>
        </div>
      )
    }
  }
}
