'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Home, Compass, BookOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@components/ui/button'

interface ResourceNotFoundProps {
  courseuuid?: string
  session?: unknown
  type?: 'activity' | 'activity-unavailable' | 'course' | 'collection' | 'user' | 'generic'
}

export default function ResourceNotFound({ courseuuid, session, type = 'generic' }: ResourceNotFoundProps) {
  const tErrors = useTranslations('Errors')
  const router = useRouter()
  // BUG-221 nit: an activity unpublished under an open tab shows this card;
  // once it is republished, coming back to the tab re-reads the page.
  useEffect(() => {
    const refresh = () => router.refresh()
    globalThis.addEventListener('focus', refresh)
    return () => globalThis.removeEventListener('focus', refresh)
  }, [router])

  const heading =
    type === 'activity'
      ? tErrors('activityNotFound')
      : type === 'activity-unavailable'
        ? tErrors('activityUnavailable')
        : type === 'collection'
          ? tErrors('collectionNotFound')
          : type === 'user'
            ? tErrors('userNotFound')
            : tErrors('courseNotFound')
  const message =
    type === 'activity'
      ? tErrors('activityNotFoundMessage')
      : type === 'activity-unavailable'
        ? tErrors('activityUnavailableMessage')
        : type === 'collection'
          ? tErrors('collectionNotFoundMessage')
          : type === 'user'
            ? tErrors('userNotFoundMessage')
            : tErrors('courseNotFoundMessage')

  const handleBackToCourse = () => {
    if (!courseuuid) return
    const isDash = typeof globalThis.window !== 'undefined' ? globalThis.location.pathname.includes('/dash/') : false
    router.push(isDash ? `/dash/courses/${courseuuid}` : `/course/${courseuuid}`)
  }

  return (
    <div className="animate-in fade-in flex min-h-[60vh] flex-col items-center justify-center p-6 text-center duration-300">
      <div className="bg-card border-border/80 w-full max-w-md rounded-xl border p-8 shadow-md transition-shadow duration-300 hover:shadow-lg">
        <div className="bg-muted/60 text-muted-foreground/80 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 ease-out hover:scale-110">
          <Compass className="h-8 w-8 stroke-[1.5]" />
        </div>

        <h1 className="text-foreground mb-2 text-xl font-semibold tracking-tight">{heading}</h1>

        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">{message}</p>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          {courseuuid ? (
            // Inside a course the only sensible exit is the course itself; the
            // dashboard is not where a learner came from.
            <Button
              variant="default"
              className="flex items-center gap-2 shadow-sm transition-colors duration-200"
              onClick={handleBackToCourse}
            >
              <BookOpen className="h-4 w-4" />
              {tErrors('backToCourse')}
            </Button>
          ) : (
            <Button
              variant="default"
              className="flex items-center gap-2 shadow-sm transition-opacity duration-200"
              onClick={() => router.push(session ? '/dash' : '/')}
            >
              <Home className="h-4 w-4" />
              {tErrors('backToDashboard')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
