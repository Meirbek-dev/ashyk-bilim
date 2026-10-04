import { useParams, Link as RouterLink } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

import { BackToCourse } from './back-to-course'

/** The player routes draw their own focus layout (the shell steps aside), so their error states need one too. */
export function PlayerFrame({ title, children }: { title: string; children: ReactNode }) {
  const { courseId = '' } = useParams({ strict: false })
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={title}>
      <section className="flex flex-col items-start gap-4">
        {children}
        <RouterLink
          to="/courses/$courseId/about"
          params={{ courseId }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {m.player_course_page()}
        </RouterLink>
      </section>
    </FocusPage>
  )
}
