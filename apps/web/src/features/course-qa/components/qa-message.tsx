import { Message, MessageContent } from '@/components/ui/message'
import { AIConfidenceMeter, AIEvidencePanel, AIStreamingText } from '@/features/ai-experience'

import { qaCitations } from '../lib/citation-utils'
import type { QAMessage } from '../lib/types'

export function QAMessageView({ message }: { message: QAMessage }) {
  const citations = qaCitations(message)
  return (
    <Message align={message.role === 'user' ? 'end' : 'start'}>
      <MessageContent>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">{message.role === 'user' ? 'You' : 'AI answer'}</span>
            {message.role === 'assistant' ? <AIConfidenceMeter confidence={message.confidence} /> : null}
          </div>
          <AIStreamingText text={message.content} />
          {message.role === 'assistant' ? <AIEvidencePanel citations={citations} /> : null}
        </div>
      </MessageContent>
    </Message>
  )
}
