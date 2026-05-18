import { apiFetch, apiFetcher, errorHandling } from '@/lib/api-client';
import type { components } from '@/lib/api/generated/schema';

export type StudentActivityRuntime = components['schemas']['StudentActivityRuntime'];
export type StudentActivityActionRequest = components['schemas']['StudentActivityActionRequest'];

export function getStudentActivityRuntime(courseUuid: string, activityUuid: string) {
  return apiFetcher<StudentActivityRuntime>(`courses/${courseUuid}/activities/${activityUuid}/runtime`);
}

export function runStudentActivityAction(
  courseUuid: string,
  activityUuid: string,
  action: StudentActivityActionRequest,
) {
  return apiFetch(`courses/${courseUuid}/activities/${activityUuid}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
    headers: { 'Content-Type': 'application/json' },
  }).then((response) => errorHandling<StudentActivityRuntime>(response));
}
