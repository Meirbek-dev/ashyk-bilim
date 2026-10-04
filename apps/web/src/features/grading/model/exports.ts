import { getLocale } from '#/paraglide/runtime'
import { client } from '#/shared/api/gen/client.gen'
import type {
  CourseId,
  ExportAssessmentSubmissionsCsvData,
  ExportFileSubmissionCsvData,
  ExportGradebookCsvData,
} from '#/shared/api/gen/types.gen'

import type { WorkKind } from './queue'

// The CSV exports exportAssessmentSubmissionsCsv(), exportFileSubmissionCsv() and exportGradebookCsv() are browser
// downloads, not fetches: plain links in the interface language (`?lang=`, B-GRD-06). Relative, so they stay
// same-origin (`vp dev` proxies /api/v2); the paths come from the client.

const lang = () => ({ lang: getLocale() })

export function queueCsvHref(kind: WorkKind, id: string): string {
  return kind === 'assessment'
    ? client.buildUrl<ExportAssessmentSubmissionsCsvData>({
        url: '/api/v2/assessments/{assessment_id}/submissions/export',
        path: { assessment_id: id },
        query: lang(),
        baseUrl: '',
      })
    : client.buildUrl<ExportFileSubmissionCsvData>({
        url: '/api/v2/file-submissions/{file_submission_id}/submissions/export',
        path: { file_submission_id: id },
        query: lang(),
        baseUrl: '',
      })
}

export const gradebookCsvHref = (courseId: CourseId): string =>
  client.buildUrl<ExportGradebookCsvData>({
    url: '/api/v2/courses/{course_id}/gradebook/export',
    path: { course_id: courseId },
    query: lang(),
    baseUrl: '',
  })
