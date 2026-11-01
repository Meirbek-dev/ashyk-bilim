import { test } from '../fixtures'
import { getEnv, resetJourney } from '../journey/state'
import { registerAuthoring } from '../journey/03-course-creation'
import { registerLearning } from '../journey/04-student-journey'
import { registerGrading } from '../journey/05-grading-loop'
import { registerAssessmentViews } from '../journey/06-assessment-rewrite'
import { registerAi } from '../journey/07-ai-experience'
import { registerArchiving } from '../journey/10-course-archiving'
import { apiAs } from '../fixtures/api'

test.describe.serial('Author → learner → grader → archive', () => {
  test.beforeAll(resetJourney)
  test.afterAll(async () => {
    const course = getEnv('E2E_COURSE_UUID')
    if (!course) return
    const api = await apiAs('teacher')
    try {
      const response = await api.delete(`courses/${course}?acknowledge_learner_work=true`)
      if (!response.ok()) throw new Error(`journey cleanup: HTTP ${response.status()}`)
    } finally {
      await api.dispose()
    }
  })
  registerAuthoring()
  registerLearning()
  registerGrading()
  registerAssessmentViews()
  test.describe('AI panels', registerAi)
  registerArchiving()
})
