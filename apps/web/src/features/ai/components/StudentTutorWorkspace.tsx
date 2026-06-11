'use client'

import { XIcon } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useActivityAIChat } from '@/components/Contexts/AI/ActivityAIChatContext'
import type { AiIntent } from '../api/ai-event-contract'
import { activityPromptIntents } from '../intents/activity-intents'
import { AiArtifactRenderer } from './AiArtifactRenderer'
import { AiComposer } from './AiComposer'
import { AiErrorState } from './AiErrorState'
import { AiStudio } from './AiStudio'
import { AiThread } from './AiThread'

export interface StudentTutorWorkspaceProps {
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudentTutorWorkspace({ title, description, open, onOpenChange }: StudentTutorWorkspaceProps) {
  const {
    messages,
    sendIntentMessage,
    isLoading,
    stop,
    error,
    clear,
    statusMessage,
    inputValue,
    setInputValue,
    artifacts,
    citations,
    toolEvents,
    runtimeEvents,
  } = useActivityAIChat()

  const latestArtifact = artifacts.at(-1)
  const visibleToolEvents = useMemo(() => toolEvents.slice(-6), [toolEvents])

  const submitPrompt = (message: string, intent: AiIntent = 'freeform') => {
    sendIntentMessage(message, intent)
    setInputValue('')
  }

  const promptFromEmptyState = (message: string, intent?: string) => {
    sendIntentMessage(message, (intent as AiIntent | undefined) ?? 'freeform')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[calc(100vw-0.75rem)] gap-0 p-0 sm:max-w-[min(96rem,calc(100vw-2rem))]"
        showCloseButton={false}
      >
        <SheetHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription className="truncate">{description}</SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <Spinner />}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close AI"
                onClick={() => onOpenChange(false)}
              >
                <XIcon data-icon="inline-start" />
              </Button>
            </div>
          </div>
          {statusMessage && (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {statusMessage}
            </p>
          )}
        </SheetHeader>
        <AiStudio.Shell>
          <AiStudio.ContextMap
            title={title}
            description={description}
            citations={citations}
            latestArtifact={latestArtifact ?? null}
            statusMessage={statusMessage}
          />
          <AiStudio.Main>
            <AiThread messages={messages} isLoading={isLoading} onPrompt={promptFromEmptyState} />
            <AiStudio.ArtifactCanvas>
              {error && <AiErrorState message={error.message} onDismiss={clear} />}
              <AiArtifactRenderer artifact={latestArtifact ?? null} />
            </AiStudio.ArtifactCanvas>
            <AiComposer
              value={inputValue}
              onChange={setInputValue}
              onSubmit={submitPrompt}
              onStop={stop}
              disabled={isLoading}
              intents={activityPromptIntents}
            />
          </AiStudio.Main>
          <AiStudio.RunConsole
            events={runtimeEvents}
            toolEvents={visibleToolEvents}
            statusMessage={statusMessage}
            isLoading={isLoading}
          />
        </AiStudio.Shell>
      </SheetContent>
    </Sheet>
  )
}
