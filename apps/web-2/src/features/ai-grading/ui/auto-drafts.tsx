import { useMutation } from '@tanstack/react-query'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, GradingSettings } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Switch } from '#/shared/ui/switch'
import { toast } from '#/shared/ui/toast'

import { settingsSwitchOptions } from '../mutations'

/**
 * The course's auto-drafts switch (B-AIG-01): on, every hand-in gets an AI draft at once, run on behalf of the teacher
 * who turned it on. A refusal (the feature off on the platform, an archived course) stays under the switch.
 */
export function AutoDrafts({ courseId, settings }: { courseId: CourseId; settings: GradingSettings }) {
  const labelId = useId()
  const hintId = useId()
  const toggle = useMutation(settingsSwitchOptions(courseId))
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h2 id={labelId} className="text-xl font-semibold">
          {m.ai_grading_auto_title()}
        </h2>
        <Switch
          aria-labelledby={labelId}
          aria-describedby={hintId}
          checked={settings.auto_grade_drafts}
          disabled={toggle.isPending}
          onCheckedChange={on =>
            toggle.mutate(
              { path: { course_id: courseId }, body: { auto_grade_drafts: on } },
              { onSuccess: () => toast.add({ title: on ? m.ai_grading_auto_on() : m.ai_grading_auto_off() }) },
            )
          }
        />
      </div>
      <p id={hintId} className="max-w-prose text-sm text-muted-foreground">
        {m.ai_grading_auto_hint()}
      </p>
      {toggle.error ? (
        <p role="alert" className="text-sm text-destructive">
          {presentError(toggle.error)}
        </p>
      ) : null}
    </section>
  )
}
