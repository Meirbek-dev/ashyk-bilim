import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { sessionOptions } from '#/shared/auth/session'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { Button } from '#/shared/ui/button'

import { AiPanel } from './ai-panel'

/**
 * The course page's AI (spec 5.4, B-AI-01): a button that opens the panel in a side sheet. Open while `?ai=` is in
 * the URL, so a link or "back" reopens it; a guest sees no button.
 */
export function AiSheet({ courseId }: { courseId: CourseId }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const { ai } = useSearch({ strict: false })
  const navigate = useNavigate()
  if (!session) return null
  return (
    <SheetPanel
      side="right"
      title={m.ai_panel_title()}
      open={ai !== undefined}
      onOpenChange={open =>
        void navigate({
          to: '.',
          search: prev => ({ ...prev, ai: open ? 'chat' : undefined, aiThread: undefined }),
          replace: true,
        })
      }
      trigger={
        <Button variant="outline">
          <Sparkles data-icon="inline-start" aria-hidden />
          {m.ai_open_panel()}
        </Button>
      }
    >
      <AiPanel courseId={courseId} surface="course-page" />
    </SheetPanel>
  )
}
