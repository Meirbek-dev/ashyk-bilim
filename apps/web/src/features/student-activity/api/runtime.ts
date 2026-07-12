import { apiJson } from '@/lib/api-client'
import type * as schemas from '@/lib/api/generated/api.schemas'

export type StudentActivityRuntime = schemas.StudentActivityRuntime
export type StudentActivityActionRequest = schemas.StudentActivityActionRequest

export function getStudentActivityRuntime(courseUuid: string, activityUuid: string) {
  return apiJson<StudentActivityRuntime>(`courses/${courseUuid}/activities/${activityUuid}/runtime`)
}

export function runStudentActivityAction(
  courseUuid: string,
  activityUuid: string,
  action: StudentActivityActionRequest,
) {
  return apiJson<StudentActivityRuntime>(`courses/${courseUuid}/activities/${activityUuid}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
    headers: { 'Content-Type': 'application/json' },
  })
}
