export interface QAMessage {
  message_uuid: string
  thread_id?: number
  role: 'user' | 'assistant' | string
  content: string
  confidence?: string | null
  citations_json?: { citations?: unknown[] }
  message_metadata?: Record<string, unknown>
  created_at: string
}

export interface CourseQAResponse {
  thread_uuid: string
  user_message: QAMessage
  assistant_message: QAMessage
}

export interface QAThreadSummary {
  thread_uuid: string
  title?: string | null
  last_message_preview: string
  message_count: number
  updated_at: string
}
