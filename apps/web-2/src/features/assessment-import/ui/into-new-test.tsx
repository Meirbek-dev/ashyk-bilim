import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { FocusPage } from '#/shared/components/templates/focus-page'

import { curriculumOptions } from '../queries'
import { ImportFlow } from './import-flow'

/** A new test in a chapter of the course (the chapter's «Тест из Excel»; the chapter can still be changed). */
export function IntoNewTest({ courseId, chapterId }: { courseId: string; chapterId: string | undefined }) {
  const navigate = useNavigate()
  const { data: curriculum } = useSuspenseQuery(curriculumOptions(courseId))
  const chapters = curriculum.chapters.filter(chapter => chapter.allowed_actions.includes('add_activity'))
  const content = { to: '/teach/courses/$courseId/content', params: { courseId } } as const
  return (
    <FocusPage
      title={m.assessment_import_title()}
      heading
      wide
      back={
        <RouterLink {...content} className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden />
          {m.platform_back_to_course()}
        </RouterLink>
      }
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-gutter">
        <ImportFlow
          courseId={courseId}
          destination={{ into: 'new' }}
          chapters={chapters}
          chapterId={chapterId}
          editable
          leave={() => void navigate(content)}
        />
      </div>
    </FocusPage>
  )
}
