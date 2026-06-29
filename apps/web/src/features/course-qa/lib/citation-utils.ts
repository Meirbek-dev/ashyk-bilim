import type { AICitation } from '@/features/ai-experience'

export function qaCitations(message: { citations_json?: { citations?: unknown[] } }) {
  return (message.citations_json?.citations ?? []) as AICitation[]
}
