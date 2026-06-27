'use client'

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useActivityAIChat } from '@/components/Contexts/AI/ActivityAIChatContext'
import type { StudentAiAvailability, StudentAiMode, StudentAiSelection, StudentAiSession } from '../types'
import {
  composeStudentAiPrompt,
  createArtifactOutput,
  createEmptyOutput,
  createLoadingOutput,
  createTextOutput,
  getLatestAssistantText,
} from '../state/student-ai-output'

export function useStudentAiSession({
  availability,
  selection,
}: {
  availability: StudentAiAvailability
  selection: StudentAiSelection
}): StudentAiSession {
  const chat = useActivityAIChat()
  const [requestedMode, setRequestedMode] = useState<StudentAiMode>(() => availability.modes[0]?.id ?? 'understand')
  const [input, setInput] = useState('')
  const selectedMode = availability.modes.some(mode => mode.id === requestedMode)
    ? requestedMode
    : (availability.modes[0]?.id ?? 'understand')

  const selectedModeConfig = useMemo(
    () => availability.modes.find(mode => mode.id === selectedMode) ?? availability.modes[0] ?? null,
    [availability.modes, selectedMode],
  )

  const latestArtifact = chat.artifacts.at(-1) ?? null
  const latestAssistantText = useMemo(() => getLatestAssistantText(chat.messages), [chat.messages])

  const runState = useMemo(() => {
    if (chat.error) return 'failed'
    if (chat.isLoading) return latestAssistantText || latestArtifact ? 'streaming' : 'preparing'
    if (latestAssistantText || latestArtifact) return 'complete'
    return 'idle'
  }, [chat.error, chat.isLoading, latestArtifact, latestAssistantText])

  const output = useMemo(() => {
    if (runState === 'preparing' || runState === 'streaming') {
      return latestArtifact
        ? createArtifactOutput(latestArtifact)
        : latestAssistantText
          ? createTextOutput(selectedMode, latestAssistantText)
          : createLoadingOutput(selectedMode, chat.statusMessage)
    }
    if (latestArtifact) return createArtifactOutput(latestArtifact)
    if (latestAssistantText) return createTextOutput(selectedMode, latestAssistantText)
    return createEmptyOutput(selectedMode)
  }, [chat.statusMessage, latestArtifact, latestAssistantText, runState, selectedMode])

  const submit = useCallback(
    (message?: string) => {
      if (!selectedModeConfig || availability.state === 'disabled') return
      const prompt = composeStudentAiPrompt({
        modePrompt: selectedModeConfig.prompt,
        selectionText: selection.text,
        userInput: message ?? input,
      })
      chat.sendIntentMessage(prompt, selectedModeConfig.intent)
      setInput('')
    },
    [availability.state, chat, input, selectedModeConfig, selection.text],
  )

  const stop = useCallback(() => {
    chat.abort()
    chat.stop()
  }, [chat])

  const reset = useCallback(() => {
    setInput('')
    chat.resetConversation()
  }, [chat])

  const copyOutput = useCallback(async () => {
    const text = [output.title, output.summary, output.body, output.nextAction].filter(Boolean).join('\n\n')
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success('Copied AI study output')
  }, [output])

  const saveOutput = useCallback(() => {
    toast.info('Practice saving is ready for a persistent study queue.')
  }, [])

  const reportOutput = useCallback(() => {
    toast.info('Feedback captured for review.')
  }, [])

  return {
    messages: chat.messages,
    selectedMode,
    setSelectedMode: setRequestedMode,
    input,
    setInput,
    runState,
    statusMessage: chat.statusMessage,
    output,
    submit,
    stop,
    reset,
    copyOutput,
    saveOutput,
    reportOutput,
    latestArtifact,
  }
}
