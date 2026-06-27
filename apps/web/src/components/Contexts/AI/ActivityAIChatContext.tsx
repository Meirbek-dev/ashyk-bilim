'use client'

/**
 * Thin shared context that wraps a single useChat instance for activity-level
 * AI workflows.
 *
 * The student AI UI was removed while the runtime contract remains available
 * for authoring flows and the future student experience rebuild.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createActivityChatAdapter } from '@services/ai/activity-chat-adapter'
import type { UseChatReturn } from '@tanstack/ai-react'
import type { TextPart } from '@tanstack/ai-client'
import type { PropsWithChildren } from 'react'
import { useChat } from '@tanstack/ai-react'
import { useTranslations } from 'next-intl'
import type {
  AiArtifact,
  AiIntent,
  AiStreamEvent,
  EvidenceCitation,
  ToolProgressEvent,
} from '@/features/ai/api/ai-event-contract'
import {
  createInitialAiRuntimeState,
  readAiStreamEventChunk,
  reduceAiStreamEvent,
} from '@/features/ai/api/ai-event-contract'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityAIChatContextValue extends UseChatReturn {
  /** In-flight status hint forwarded from the backend status SSE events. */
  statusMessage: string | null
  /** Whether the chat panel is visible. */
  isModalOpen: boolean
  /** Opens the panel without forcing a new backend session. */
  openModal: () => void
  setIsModalOpen: (open: boolean) => void
  /** Current text input value. */
  inputValue: string
  setInputValue: (value: string) => void
  /** Aborts the current in-flight backend request. */
  abort: () => void
  /** Clears local chat state and resets the backend session UUID. */
  resetConversation: () => void
  /** Sends a prompt and resolves with the final assistant text for that run. */
  sendMessageAndGetResponse: (message: string, intent?: AiIntent) => Promise<string>
  /** Sends a prompt with a typed LMS AI intent. */
  sendIntentMessage: (message: string, intent: AiIntent) => void
  /** Ordered v2 runtime events emitted by the backend. */
  runtimeEvents: AiStreamEvent[]
  /** Structured artifacts produced by the backend for this thread. */
  artifacts: AiArtifact[]
  /** Citations extracted from typed artifact and citation events. */
  citations: EvidenceCitation[]
  /** Tool progress events for the current thread. */
  toolEvents: ToolProgressEvent[]
}

// ── Context ───────────────────────────────────────────────────────────────────

const ActivityAIChatContext = createContext<ActivityAIChatContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

interface ActivityAIChatProviderProps {
  activityUuid: string
  getContextSnapshot?: () => Record<string, unknown> | null
}

export function ActivityAIChatProvider({
  activityUuid,
  getContextSnapshot,
  children,
}: PropsWithChildren<ActivityAIChatProviderProps>) {
  const tStatus = useTranslations('Activities.AIStatus')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [runtimeState, setRuntimeState] = useState(createInitialAiRuntimeState)

  // Store the adapter's abort function so we can cancel in-flight requests.
  const abortRef = useRef<(() => void) | null>(null)
  const resolverQueueRef = useRef<((value: string) => void)[]>([])

  const adapter = useMemo(
    () =>
      createActivityChatAdapter({
        activityUuid,
        ...(getContextSnapshot ? { getContextSnapshot } : {}),
        getStatusMessage: status => {
          switch (status) {
            case 'processing': {
              return tStatus('processing')
            }
            case 'retrieving': {
              return tStatus('retrieving')
            }
            case 'analyzing': {
              return tStatus('analyzing')
            }
            case 'generating': {
              return tStatus('generating')
            }
            case 'aborted': {
              return tStatus('aborted')
            }
            default: {
              return tStatus('working')
            }
          }
        },
      }),
    // Recreate adapter only when the activity changes — access token and
    // session UUID changes are handled inside the adapter.
    [activityUuid, getContextSnapshot, tStatus],
  )

  // Keep the abort ref in sync whenever the adapter is recreated.
  useEffect(() => {
    abortRef.current = adapter.abort
    return () => {
      adapter.abort()
    }
  }, [adapter])

  const settleNextPendingResponse = useCallback(
    (value: string) => {
      resolverQueueRef.current.shift()?.(value)
    },
    [resolverQueueRef],
  )

  const chat = useChat({
    connection: adapter.connection,
    onChunk: chunk => {
      const runtimeEvent = readAiStreamEventChunk(chunk)
      if (runtimeEvent) {
        setRuntimeState(prev => reduceAiStreamEvent(prev, runtimeEvent))
        if (runtimeEvent.type === 'status.changed') {
          setStatusMessage(runtimeEvent.payload.message)
        }
        if (
          runtimeEvent.type === 'run.finished' ||
          runtimeEvent.type === 'run.error' ||
          runtimeEvent.type === 'run.aborted'
        ) {
          setStatusMessage(null)
        }
      }
      if (chunk.type === 'CUSTOM' && chunk.name === 'ai_status') {
        setStatusMessage((chunk.value as { message?: string }).message ?? null)
      }
    },
    onFinish: message => {
      setStatusMessage(null)
      adapter.setIntent('freeform')
      const text = message.parts
        .filter((part): part is TextPart => part.type === 'text')
        .map(part => part.content)
        .join('')
      settleNextPendingResponse(text)
    },
    onError: () => {
      setStatusMessage(null)
      adapter.setIntent('freeform')
      settleNextPendingResponse('')
    },
  })

  const chatStopRef = useRef(chat.stop)
  const chatClearRef = useRef(chat.clear)
  const chatSendMessageRef = useRef(chat.sendMessage)

  useEffect(() => {
    chatStopRef.current = chat.stop
    chatClearRef.current = chat.clear
    chatSendMessageRef.current = chat.sendMessage
  }, [chat.stop, chat.clear, chat.sendMessage])

  const abort = useCallback(() => {
    abortRef.current?.()
  }, [abortRef])

  const resetConversation = useCallback(() => {
    abort()
    chatStopRef.current()
    chatClearRef.current()
    adapter.resetSession()
    setStatusMessage(null)
    setInputValue('')
    setRuntimeState(createInitialAiRuntimeState())

    while (resolverQueueRef.current.length) {
      resolverQueueRef.current.shift()?.('')
    }
  }, [abort, adapter, chatStopRef, chatClearRef, setStatusMessage, setInputValue, setRuntimeState, resolverQueueRef])

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const sendMessageAndGetResponse = useCallback(
    (message: string, intent: AiIntent = 'freeform'): Promise<string> => {
      if (!message.trim()) {
        return Promise.resolve('')
      }

      return new Promise(resolve => {
        adapter.setIntent(intent)
        resolverQueueRef.current.push(resolve)
        chatSendMessageRef.current(message)
      })
    },
    [adapter, resolverQueueRef, chatSendMessageRef],
  )

  const sendIntentMessage = useCallback(
    (message: string, intent: AiIntent) => {
      if (!message.trim()) {
        return
      }
      adapter.setIntent(intent)
      void chatSendMessageRef.current(message)
    },
    [adapter, chatSendMessageRef],
  )

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      resetConversation()
      setIsModalOpen(false)
    })
    return () => cancelAnimationFrame(handle)
  }, [activityUuid, resetConversation])

  useEffect(() => {
    const pendingResolvers = resolverQueueRef.current

    return () => {
      while (pendingResolvers.length) {
        pendingResolvers.shift()?.('')
      }
    }
  }, [resolverQueueRef])

  // Abort stream and clear input when the panel closes.
  useEffect(() => {
    let handle: number | null = null
    if (!isModalOpen) {
      abort()
      chatStopRef.current()
      handle = requestAnimationFrame(() => {
        setInputValue('')
      })
    }
    return () => {
      if (handle !== null) {
        cancelAnimationFrame(handle)
      }
    }
  }, [abort, isModalOpen, chatStopRef])

  const value = useMemo(
    () => ({
      ...chat,
      statusMessage,
      isModalOpen,
      openModal,
      setIsModalOpen,
      inputValue,
      setInputValue,
      abort,
      resetConversation,
      sendMessageAndGetResponse,
      sendIntentMessage,
      runtimeEvents: runtimeState.events,
      artifacts: runtimeState.artifacts,
      citations: runtimeState.citations,
      toolEvents: runtimeState.toolEvents,
    }),
    [
      chat,
      statusMessage,
      isModalOpen,
      openModal,
      inputValue,
      abort,
      resetConversation,
      sendMessageAndGetResponse,
      sendIntentMessage,
      runtimeState,
    ],
  )

  return <ActivityAIChatContext.Provider value={value}>{children}</ActivityAIChatContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useActivityAIChat(): ActivityAIChatContextValue {
  const ctx = useContext(ActivityAIChatContext)
  if (!ctx) throw new Error('useActivityAIChat must be used within ActivityAIChatProvider')
  return ctx
}
