'use client'

import { createContext, useContext } from 'react'
import type * as React from 'react'

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { AIConfidenceMeter } from './ai-confidence-meter'
import { AIRunTimeline } from './ai-run-timeline'
import { AI_STATE_LABELS, modelAuditLabel } from '../lib/ai-copy'
import type { AICitation } from '../lib/ai-citations'
import type { AIWorkState } from '../lib/ai-run-state'

type AIResultShellContextValue = {
  title: string
  description?: string
  state: AIWorkState
  confidence?: string | null | undefined
  modelName?: string | null | undefined
  citations?: AICitation[]
}

const AIResultShellContext = createContext<AIResultShellContextValue | null>(null)

function useAIResultShell() {
  const value = useContext(AIResultShellContext)
  if (!value) throw new Error('AIResultShell components must be used inside AIResultShell.Provider')
  return value
}

function Provider({ value, children }: { value: AIResultShellContextValue; children: React.ReactNode }) {
  return <AIResultShellContext.Provider value={value}>{children}</AIResultShellContext.Provider>
}

function Frame({ children }: { children: React.ReactNode }) {
  return <Card>{children}</Card>
}

function Header({ action }: { action?: React.ReactNode }) {
  const { title, description, state, confidence } = useAIResultShell()
  return (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
      <CardAction className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{AI_STATE_LABELS[state]}</Badge>
        <AIConfidenceMeter confidence={confidence} />
        {action}
      </CardAction>
    </CardHeader>
  )
}

function StatusTimeline() {
  const { state } = useAIResultShell()
  return (
    <CardContent>
      <AIRunTimeline state={state} />
    </CardContent>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <CardContent className="flex flex-col gap-4">{children}</CardContent>
}

function AuditMetadata() {
  const { modelName, citations } = useAIResultShell()
  return (
    <CardContent className="text-muted-foreground flex flex-wrap gap-2 text-xs">
      <span>{modelAuditLabel(modelName)}</span>
      <span>Citations: {citations?.length ?? 0}</span>
    </CardContent>
  )
}

export const AIResultShell = {
  Provider,
  Frame,
  Header,
  StatusTimeline,
  Body,
  AuditMetadata,
}
