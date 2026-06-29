import { SparklesIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

interface AIEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function AIEmptyState({ title, description, actionLabel, onAction }: AIEmptyStateProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SparklesIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {actionLabel && onAction ? (
        <EmptyContent>
          <Button onClick={onAction}>
            <SparklesIcon data-icon="inline-start" />
            {actionLabel}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
