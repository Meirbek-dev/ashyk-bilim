import { useParams, Link as RouterLink } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'
import { FocusPage } from '#/shared/components/templates/focus-page'

import { BackToCourse } from './back-to-course'

type PlayerFrameProps = { title: string; text?: string; children?: ReactNode }

/**
 * The player routes draw their own focus layout (the shell steps aside), so their error states need one too: the
 * app's status screen (ornament, heading, one sentence) with the way to the course page.
 */
export function PlayerFrame({ title, text, children }: PlayerFrameProps) {
  const { courseId = '' } = useParams({ strict: false })
  return (
    <FocusPage back={<BackToCourse courseId={courseId} />} title={title}>
      {children ?? (
        <StatusScreen title={title} {...(text ? { text } : {})}>
          <RouterLink to="/courses/$courseId/about" params={{ courseId }} className={buttonVariants()}>
            {m.player_course_page()}
          </RouterLink>
        </StatusScreen>
      )}
    </FocusPage>
  )
}
