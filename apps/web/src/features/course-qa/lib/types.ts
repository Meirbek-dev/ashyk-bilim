export type QAMessage = {
  message_uuid: string
  role: 'user' | 'assistant' | string
  content: string
  confidence?: string | null
  citations_json?: { citations?: unknown[] }
  created_at: string
}

export type CourseQAResponse = {
  thread_uuid: string
  user_message: QAMessage
  assistant_message: QAMessage
}
