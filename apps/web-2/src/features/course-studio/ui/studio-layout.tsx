import { useSuspenseQuery } from '@tanstack/react-query'
import { Outlet, useMatch, useParams, Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

import { activityOptions } from '../curriculum-queries'
import { PublishSwitch } from './publish-switch'
import { SaveStatusContext, type SaveState } from './save-status'

const saveLabels: Record<SaveState, () => string> = {
  dirty: m.studio_save_dirty,
  saving: m.studio_save_saving,
  saved: m.studio_save_saved,
  failed: m.studio_save_failed,
}

/** The activity studio (spec 5.4): focus layout, its 4 route tabs, autosave status and the published switch. */
export function CourseStudioLayout() {
  const { courseId, activityId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { staticData } = useMatch({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const { data: activity } = useSuspenseQuery(activityOptions(activityId))
  const [save, setSave] = useState<{ activityId: string; state: SaveState } | null>(null)
  const state = save?.activityId === activityId ? save.state : null
  const back = (
    <RouterLink
      to="/teach/courses/$courseId/content"
      params={{ courseId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </RouterLink>
  )
  return (
    <FocusPage
      back={back}
      title={activity.name}
      saveStatus={state ? <output>{saveLabels[state]()}</output> : null}
      actions={<PublishSwitch courseId={courseId} activity={activity} />}
      wide
    >
      <div className="flex flex-col gap-gutter">
        <nav aria-label={m.ui_sections()} className="flex overflow-x-auto border-b">
          {(staticData.tabs ?? []).map(tab => (
            <Link key={tab.to} variant="tab" to={tab.to} params={{ courseId, activityId }}>
              {tab.label()}
            </Link>
          ))}
        </nav>
        <SaveStatusContext value={(id, next) => setSave({ activityId: id, state: next })}>
          <Outlet />
        </SaveStatusContext>
      </div>
    </FocusPage>
  )
}
