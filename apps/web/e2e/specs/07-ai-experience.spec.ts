import { expect, testAsStudent, testAsTeacher } from '../fixtures'
import { getEnv } from '../env'

const courseUuid = getEnv('E2E_COURSE_UUID') ?? ''
const activityId = getEnv('E2E_EXAM_ACTIVITY_ID') ?? ''
const submissionUuid = getEnv('E2E_SUBMISSION_UUID') ?? ''

testAsTeacher.beforeEach(async ({ page }) => {
  await mockAI(page)
})

testAsStudent.beforeEach(async ({ page }) => {
  await mockAI(page)
})

testAsTeacher('teacher can run and publish course analysis', async ({ page }) => {
  testAsTeacher.skip(!courseUuid, 'Set E2E_COURSE_UUID first.')

  await page.goto(`/en/course/${courseUuid}`)
  await page.getByRole('tab', { name: 'Review' }).click()
  await page.getByRole('button', { name: /analyze|rerun/i }).click()

  await expect(page.getByText(/Course quality score 82/i)).toBeVisible()
  await page.getByRole('button', { name: /publish score/i }).click()
  await page.getByRole('button', { name: /publish reviewed score/i }).click()
})

testAsStudent('student can ask course Q&A with citations', async ({ page }) => {
  testAsStudent.skip(!courseUuid, 'Set E2E_COURSE_UUID first.')

  await page.goto(`/en/course/${courseUuid}`)
  await page.getByRole('tab', { name: 'Q&A' }).click()
  await page.getByPlaceholder(/ask/i).fill('What should I review before the quiz?')
  await page.getByRole('button', { name: /^ask$/i }).click()

  await expect(page.getByText(/Review the worked example/i)).toBeVisible()
  await expect(page.getByText(/Lesson 1/i)).toBeVisible()
})

testAsTeacher('teacher can analyze a submission and generate a remediation gate', async ({ page }) => {
  testAsTeacher.skip(
    !courseUuid || !activityId || !submissionUuid,
    'Set E2E_COURSE_UUID, E2E_EXAM_ACTIVITY_ID, and E2E_SUBMISSION_UUID first.',
  )

  await page.goto(`/en/dash/courses/${courseUuid}/activity/${activityId}/review?submission=${submissionUuid}`)
  await page.getByRole('button', { name: /analyze/i }).click()

  await expect(page.getByText(/1 knowledge gaps/i)).toBeVisible()
  await page.getByRole('button', { name: /generate remediation gate/i }).click()
  await expect(page.getByText(/Adaptive remediation/i)).toBeVisible()
})

async function mockAI(page: import('@playwright/test').Page) {
  let courseAnalysisReady = false
  let qaReady = false
  const courseAnalysis = {
    analysis_uuid: 'course_analysis_e2e',
    public_score: 82,
    status: 'needs_human_review',
    language: 'en',
    model_name: 'e2e-model',
    report_json: {
      summary: 'Course analysis is ready for review.',
      confidence: 'medium',
      risks: ['Assessment coverage needs teacher review.'],
      strengths: ['The course has a clear opening lesson.'],
      recommendations: [
        {
          title: 'Add assessment coverage',
          rationale: 'The current course needs one more practice checkpoint.',
          priority: 'high',
          action: 'Add a short quiz before publishing the score.',
        },
      ],
      citations: [
        {
          citation_id: 'lesson-1',
          label: 'Lesson 1',
          source_type: 'activity',
          source_uuid: 'lesson-1',
          excerpt: 'Course material',
          confidence: 0.82,
        },
      ],
    },
  }
  const qaMessages = [
    {
      id: 1,
      thread_id: 1,
      course_id: 1,
      user_id: 1,
      message_uuid: 'msg_user',
      role: 'user',
      content: 'What should I review before the quiz?',
      citations_json: {},
      message_metadata: {},
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      thread_id: 1,
      course_id: 1,
      user_id: 1,
      message_uuid: 'msg_ai',
      role: 'assistant',
      content: 'Review the worked example before the quiz.',
      confidence: 'medium',
      citations_json: {
        citations: [
          {
            citation_id: 'lesson-1',
            label: 'Lesson 1',
            source_type: 'activity',
            source_uuid: 'lesson-1',
            excerpt: 'Worked example',
            confidence: 0.8,
          },
        ],
      },
      message_metadata: {},
      created_at: new Date().toISOString(),
    },
  ]

  await page.route('**/api/v1/ai/capabilities/scope/*', route =>
    route.fulfill({
      json: {
        available: true,
        role: 'teacher',
        surface: 'course-page',
        context_visibility: 'teacher',
        restricted: false,
        reason: null,
        modes: ['ask', 'analyze'],
        features: [],
        context: {
          course_label: 'E2E course',
          activity_label: null,
          activity_uuid: null,
          source_count: 2,
        },
      },
    }),
  )
  await page.route('**/api/v1/ai/course-analysis/*/latest', route =>
    route.fulfill({ json: courseAnalysisReady ? courseAnalysis : null }),
  )
  await page.route('**/api/v1/ai/course-analysis/*/analyze/queue', route => {
    courseAnalysisReady = true
    return route.fulfill({
      json: {
        run_uuid: 'run_course_analysis_e2e',
        status: 'queued',
        run_metadata: {},
      },
    })
  })
  await page.route('**/api/v1/ai/runs/*/stream', route =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: [
        'data: {"type":"RUN_STARTED","threadId":"thread_e2e","runId":"run_course_analysis_e2e"}',
        '',
        'data: {"type":"CUSTOM","name":"run_state","value":{"state":"collecting_context"}}',
        '',
        'data: {"type":"CUSTOM","name":"run_state","value":{"state":"checking_evidence"}}',
        '',
        'data: {"type":"RUN_FINISHED","threadId":"thread_e2e","runId":"run_course_analysis_e2e"}',
        '',
      ].join('\n'),
    }),
  )
  await page.route('**/api/v1/ai/runs/*/artifacts', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/ai/course-analysis/*/publish', route => route.fulfill({ json: { ok: true } }))
  await page.route('**/api/v1/ai/qa/*/threads**', route => {
    if (route.request().url().includes('/threads/thread_e2e')) {
      return route.fulfill({ json: qaMessages })
    }
    return route.fulfill({
      json: qaReady
        ? [
            {
              thread_uuid: 'thread_e2e',
              title: null,
              last_message_preview: 'Review the worked example before the quiz.',
              message_count: 2,
              updated_at: new Date().toISOString(),
            },
          ]
        : [],
    })
  })
  await page.route('**/api/v1/ai/qa/*/chat', route => {
    qaReady = true
    return route.fulfill({
      contentType: 'text/event-stream',
      body: [
        'data: {"type":"RUN_STARTED","threadId":"thread_e2e","runId":"run_qa_e2e"}',
        '',
        'data: {"type":"TEXT_MESSAGE_START","messageId":"msg_ai","role":"assistant"}',
        '',
        'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_ai","delta":"Review the worked example before the quiz."}',
        '',
        'data: {"type":"TEXT_MESSAGE_END","messageId":"msg_ai"}',
        '',
        'data: {"type":"TOOL_CALL_START","toolCallId":"tool_1","toolCallName":"course_citations","parentMessageId":"msg_ai"}',
        '',
        `data: ${JSON.stringify({ type: 'TOOL_CALL_RESULT', messageId: 'msg_tool', toolCallId: 'tool_1', content: JSON.stringify({ citations: qaMessages[1]?.citations_json.citations }) })}`,
        '',
        'data: {"type":"TOOL_CALL_END","toolCallId":"tool_1"}',
        '',
        'data: {"type":"RUN_FINISHED","threadId":"thread_e2e","runId":"run_qa_e2e","result":{"thread_uuid":"thread_e2e","message_uuid":"msg_ai"}}',
        '',
      ].join('\n'),
    })
  })
  await page.route('**/api/v1/ai/submission-analysis/*/latest', route => route.fulfill({ json: null }))
  await page.route('**/api/v1/ai/submission-analysis/*/analyze', route =>
    route.fulfill({
      json: {
        analysis_uuid: 'submission_analysis_e2e',
        gap_count: 1,
        status: 'complete',
        language: 'en',
        model_name: 'e2e-model',
        analysis_json: {
          summary: 'One misconception needs remediation.',
          confidence: 'medium',
          knowledge_gaps: [
            { concept: 'Loop condition', severity: 'medium', remediation_goal: 'Practice tracing loop exits.' },
          ],
          citations: [],
        },
      },
    }),
  )
  await page.route('**/api/v1/ai/remediation/*/generate', route =>
    route.fulfill({
      json: {
        session_uuid: 'remediation_e2e',
        status: 'active',
        gate_mode: true,
        score: null,
        lecture_json: {
          title: 'Adaptive remediation',
          micro_lecture_markdown: 'Trace the loop one iteration at a time.',
          learning_objectives: ['Identify the exit condition'],
          citations: [],
        },
        test_json: { questions: [] },
      },
    }),
  )
}
