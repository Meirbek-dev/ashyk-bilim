import { useParams, useSearch } from '@tanstack/react-router'

import { IntoNewTest } from './into-new-test'
import { IntoTest } from './into-test'

const IMPORT = '/_authed/teach/courses/$courseId_/import'

/** Upload a DOT .xlsx test, see every problem by its cell, create the test (or load its questions) in one step. */
export function AssessmentImportPage() {
  const { courseId } = useParams({ from: IMPORT })
  const { test, chapter } = useSearch({ from: IMPORT })
  return test ? (
    <IntoTest courseId={courseId} activityId={test} />
  ) : (
    <IntoNewTest courseId={courseId} chapterId={chapter} />
  )
}
