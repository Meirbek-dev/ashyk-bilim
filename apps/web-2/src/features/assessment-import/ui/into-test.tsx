import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { FocusPage } from '#/shared/components/templates/focus-page'

import { targetTestOptions } from '../queries'
import { ImportFlow } from './import-flow'

/** The questions of an existing test replaced or appended (its builder's «Загрузить вопросы из Excel»). */
export function IntoTest({ courseId, activityId }: { courseId: string; activityId: string }) {
  const navigate = useNavigate()
  const { data: test } = useSuspenseQuery(targetTestOptions(activityId))
  // As the builder: `edit` (no attempts yet); the server loads questions only into a draft.
  const editable = test.allowed_actions.includes('edit') && test.lifecycle === 'draft'
  const builder = {
    to: '/teach/courses/$courseId/activities/$activityId/edit',
    params: { courseId, activityId },
  } as const
  return (
    <FocusPage
      title={m.assessment_import_title_into({ name: test.title })}
      heading
      wide
      back={
        <RouterLink {...builder} className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden />
          {m.assessment_import_back_test()}
        </RouterLink>
      }
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-gutter">
        <ImportFlow
          courseId={courseId}
          destination={{ into: 'test', activityId, assessmentId: test.id }}
          chapters={[]}
          chapterId={undefined}
          editable={editable}
          leave={() => void navigate(builder)}
        />
      </div>
    </FocusPage>
  )
}
