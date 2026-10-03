import { useParams } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'
import { FocusPage } from '#/shared/ui/templates/focus-page'

import { BackToCourse } from './back-to-course'

/** The player routes draw their own focus layout (the shell steps aside), so their error states need one too. */
export function PlayerFrame({ title, children }: { title: string; children: ReactNode }) {
  const { courseId = '' } = useParams({ strict: false })
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={title}>
      <section className="flex flex-col items-start gap-4">
        {children}
        <Link to="/courses/$courseId/about" params={{ courseId }} variant="outline">
          {m.player_course_page()}
        </Link>
      </section>
    </FocusPage>
  )
}
