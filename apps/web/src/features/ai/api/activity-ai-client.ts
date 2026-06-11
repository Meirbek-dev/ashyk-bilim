import type { AiIntent } from './ai-event-contract'

export interface ActivityAiMessageRequest {
  activity_uuid: string
  message: string
  intent?: AiIntent
  aichat_uuid?: string
}

export const DEFAULT_AI_INTENT: AiIntent = 'freeform'

export const createIntentMessage = (message: string, intent: AiIntent = DEFAULT_AI_INTENT) => ({
  message,
  intent,
})
