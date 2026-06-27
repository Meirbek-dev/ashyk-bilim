'use client'

import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import type { StudentAiAvailability } from '../types'
import { useStudentAiSelection } from '../hooks/useStudentAiSelection'
import { useStudentAiSession } from '../hooks/useStudentAiSession'
import { StudentAiAnswerCanvas } from './StudentAiAnswerCanvas'
import { StudentAiContextLens } from './StudentAiContextLens'
import { StudentAiFollowUpComposer } from './StudentAiFollowUpComposer'
import { StudentAiModePicker } from './StudentAiModePicker'
import { StudentAiRunStatus } from './StudentAiRunStatus'
import { StudentAiSafetyBoundary } from './StudentAiSafetyBoundary'

const LAYER_TITLE = 'AI study layer'

export function StudentAiLayer({
  availability,
  onOpenChange,
  open,
  runtime,
}: {
  availability: StudentAiAvailability
  onOpenChange: (open: boolean) => void
  open: boolean
  runtime: StudentActivityRuntime
}) {
  const selection = useStudentAiSelection(open && availability.state !== 'disabled')
  const session = useStudentAiSession({ availability, selection })
  const activityTitle = runtime.activity?.title ?? runtime.course.title
  const disabled = availability.state === 'disabled'

  if (disabled) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="inset-x-2 bottom-2 mx-auto max-h-[min(82dvh,46rem)] w-[calc(100vw-1rem)] max-w-6xl gap-0 overflow-hidden rounded-xl border p-0 shadow-2xl sm:inset-x-4 sm:bottom-4 sm:w-[calc(100vw-2rem)]"
      >
        <SheetHeader className="border-border/70 border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>{LAYER_TITLE}</SheetTitle>
              <SheetDescription className="truncate">{activityTitle}</SheetDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close AI study layer"
              onClick={() => onOpenChange(false)}
            >
              <XIcon data-icon="inline-start" />
            </Button>
          </div>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="bg-muted/20 hidden min-h-0 border-e lg:flex lg:flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-4 p-4">
                <StudentAiModePicker
                  modes={availability.modes}
                  value={session.selectedMode}
                  onValueChange={session.setSelectedMode}
                />
                <StudentAiContextLens availability={availability} selection={selection} />
                <StudentAiSafetyBoundary safety={availability.safety} />
              </div>
            </ScrollArea>
          </aside>

          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="border-border/70 flex flex-col gap-3 border-b p-3 lg:hidden">
              <StudentAiModePicker
                modes={availability.modes}
                value={session.selectedMode}
                onValueChange={session.setSelectedMode}
              />
              <StudentAiContextLens availability={availability} selection={selection} />
            </div>

            <div className="border-border/70 border-b p-3">
              <StudentAiRunStatus
                runState={session.runState}
                statusMessage={session.statusMessage}
                onStop={session.stop}
              />
            </div>

            <ScrollArea className="min-h-0">
              <div className="flex flex-col gap-4 p-4">
                <div className="lg:hidden">
                  <StudentAiSafetyBoundary safety={availability.safety} />
                </div>
                <StudentAiAnswerCanvas
                  output={session.output}
                  onCopy={() => void session.copyOutput()}
                  onSave={session.saveOutput}
                  onReport={session.reportOutput}
                  onRegenerate={() => session.submit()}
                />
              </div>
            </ScrollArea>

            <StudentAiFollowUpComposer
              disabled={availability.safety.level === 'blocked'}
              input={session.input}
              onInputChange={session.setInput}
              onStop={session.stop}
              onSubmit={() => session.submit()}
              runState={session.runState}
            />
          </main>
        </div>
      </SheetContent>
    </Sheet>
  )
}
