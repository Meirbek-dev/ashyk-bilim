'use client'

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'
import { CourseProvider } from '@components/Contexts/CourseContext'
import StudentActivityWorkspace from '@/features/student-activity/shell/StudentActivityWorkspace'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { ActivityLayoutProvider } from '@/features/assessments/shell/ActivityLayoutContext'
import { ActivityContentRenderer } from './ActivityContentRenderer'

interface ActivityClientProps {
  activityid: string
  courseuuid: string
  activity: Activity | null
  course: CourseStructure
  runtime: StudentActivityRuntime
}

export default function ActivityClient({ activityid, courseuuid, activity, course, runtime }: ActivityClientProps) {
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
          />
        </StudentActivityWorkspace>
      </ActivityLayoutProvider>
    </CourseProvider>
  )
}
