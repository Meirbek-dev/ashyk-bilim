import { client } from '#/shared/api/gen/client.gen'
import type { ExportAssessmentData } from '#/shared/api/gen/types.gen'

// exportAssessment() is a browser download, not a fetch: a plain same-origin link (`vp dev` proxies /api/v2).

/** «Скачать как Excel»: the test's questions in the DOT format. */
export const assessmentXlsxHref = (assessmentId: string): string =>
  client.buildUrl<ExportAssessmentData>({
    url: '/api/v2/assessments/{assessment_id}/export',
    path: { assessment_id: assessmentId },
    baseUrl: '',
  })

/** The example workbook (one question of each type and a sheet of instructions). */
export const TEMPLATE_HREF = '/templates/test-template.xlsx'
