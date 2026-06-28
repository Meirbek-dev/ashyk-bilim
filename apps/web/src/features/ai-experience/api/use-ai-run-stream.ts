'use client'

import { useEffect, useState } from 'react'

import { apiStreamFetch } from '@/lib/api-client'

import type { AIWorkState } from '../lib/ai-run-state'

export type AIRunStreamEvent = {
  state: AIWorkState
  message?: string
  payload?: unknown
}

export function useAIRunStream(path: string | null) {
  const [events, setEvents] = useState<AIRunStreamEvent[]>([])
  const [state, setState] = useState<AIWorkState>('idle')
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!path) return
    const activePath = path
    const controller = new AbortController()
    let buffer = ''

    async function readStream() {
      try {
        setState('queued')
        const response = await apiStreamFetch(activePath, { signal: controller.signal, timeoutMs: false })
        if (!response.body) throw new Error('AI stream response had no body')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''
          for (const chunk of chunks) {
            const line = chunk
              .split('\n')
              .find(part => part.startsWith('data:'))
              ?.replace(/^data:\s*/, '')
            if (!line) continue
            const event = JSON.parse(line) as AIRunStreamEvent
            setEvents(current => [...current, event])
            setState(event.state)
          }
        }
      } catch (streamError) {
        if (!controller.signal.aborted) {
          setError(streamError instanceof Error ? streamError : new Error('AI stream failed'))
          setState('failed')
        }
      }
    }

    void readStream()
    return () => controller.abort()
  }, [path])

  return { events, state, error }
}
