'use client'

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'
import { CourseProvider } from '@components/Contexts/CourseContext'
import StudentActivityWorkspace from '@/features/student-activity/shell/StudentActivityWorkspace'
import { useRuntimeAction } from '@/features/student-activity/shell/BottomActionBar'
import { getStudentActivityRuntime, type StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { ActivityLayoutProvider } from '@/features/assessments/shell/ActivityLayoutContext'
import { ActivityContentRenderer } from './ActivityContentRenderer'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'

interface ActivityClientProps {
  activityid: string
  courseuuid: string
  activity: Activity | null
  course: CourseStructure
  runtime: StudentActivityRuntime
}

export default function ActivityClient({
  activityid,
  courseuuid,
  activity,
  course,
  runtime: initialRuntime,
}: ActivityClientProps) {
  // The server-rendered runtime seeds the query the action bar invalidates; it
  // then follows learner-state's focus policy so the sidebar sees a lesson
  // published meanwhile (UX-080). Unpublished under us → keep the last runtime.
  const { data } = useQuery({
    queryKey: queryKeys.studentActivity.runtime(courseuuid, activityid),
    queryFn: () => getStudentActivityRuntime(courseuuid, activityid),
    initialData: initialRuntime,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })
  const runtime = data ?? initialRuntime
  // Watching a lesson video to the end completes it - no extra «Отметить» click.
  const completion = useRuntimeAction(courseuuid, runtime)
  const canMark = runtime.primary_action.id === 'mark_complete' && runtime.primary_action.enabled
  // The server already fetched the (published-only) structure; seeding it skips one client round trip.
  return (
    <CourseProvider courseuuid={course.course_uuid} initialCourse={course}>
      <ActivityLayoutProvider>
        <StudentActivityWorkspace activity={activity} courseUuid={courseuuid} runtime={runtime}>
          <ActivityContentRenderer
            activity={activity}
            canView={runtime.permissions.can_view}
            course={course}
            courseuuid={courseuuid}
            isCourseEnd={activityid === 'end'}
            onMediaEnded={canMark ? () => completion.run('mark_complete') : undefined}
          />
        </StudentActivityWorkspace>
      </ActivityLayoutProvider>
    </CourseProvider>
  )
}
