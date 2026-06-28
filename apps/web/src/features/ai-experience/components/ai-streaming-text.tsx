import { cn } from '@/lib/utils'

type AIStreamingTextProps = {
  text: string
  streaming?: boolean
  className?: string
}

export function AIStreamingText({ text, streaming = false, className }: AIStreamingTextProps) {
  return (
    <div
      className={cn('whitespace-pre-wrap text-sm leading-relaxed', className)}
      aria-live={streaming ? 'polite' : undefined}
    >
      {text}
    </div>
  )
}
