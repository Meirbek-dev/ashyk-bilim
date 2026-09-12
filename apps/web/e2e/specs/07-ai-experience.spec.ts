/**
 * AI experience (v2 wire): course analysis, course Q&A, submission analysis +
 * remediation. The local API has no LLM, so every `/api/v2/ai/**` call the
 * panels make is answered at the network edge with the v2 shapes
 * (`apps/server/openapi.v2.json`: `RunStatus`, `RunArtifact`, `CourseAnalysis`,
 * `SubmissionAnalysis`, `QaThreadSummary`, `QaMessage`; AG-UI SSE for
 * `runs/{id}/stream` and `qa/{course}/chat`).
 *
 * Ids come from `process.env.E2E_*` (set by specs 03/04 in the full suite, or
 * exported by hand for a standalone run) and are read lazily so the skip
 * guards see the values the earlier specs wrote.
 */

import type { Page, Route } from '@playwright/test'
import { expect, testAsStudent, testAsTeacher } from '../fixtures'
import { getEnv } from '../env'

const courseUuid = () => getEnv('E2E_COURSE_UUID') ?? ''
const activityId = () => getEnv('E2E_EXAM_ACTIVITY_ID') ?? ''
const submissionUuid = () => getEnv('E2E_SUBMISSION_UUID') ?? ''

testAsTeacher.beforeEach(async ({ page }) => {
  await mockAI(page)
})

testAsStudent.beforeEach(async ({ page }) => {
  await mockAI(page)
})

testAsTeacher('teacher can run and publish course analysis', async ({ page }) => {
  testAsTeacher.skip(!courseUuid(), 'Set E2E_COURSE_UUID first.')

  await page.goto(`/en/course/${courseUuid()}`)
  await page.getByRole('tab', { name: 'Review' }).click()
  await page.getByRole('button', { name: /^(analyze|rerun)$/i }).click()

  await expect(page.getByText('Course quality score 82')).toBeVisible()
  await expect(page.getByText('Add assessment coverage')).toBeVisible()
  // The publish button stays disabled until the teacher confirms the evidence review.
  await page.getByRole('checkbox', { name: /reviewed them before publishing/i }).check()
  await page.getByRole('button', { name: 'Publish score' }).click()
  await page.getByRole('button', { name: 'Publish reviewed score' }).click()

  await expect(page.getByText('Published', { exact: true })).toBeVisible()
})

testAsStudent('student can ask course Q&A with citations', async ({ page }) => {
  testAsStudent.skip(!courseUuid(), 'Set E2E_COURSE_UUID first.')

  await page.goto(`/en/course/${courseUuid()}`)
  await page.getByRole('tab', { name: 'Q&A' }).click()
  await page.getByPlaceholder(/ask about this course/i).fill('What should I review before the quiz?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()

  await expect(page.getByText('Review the worked example before the quiz.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Lesson 1/ })).toBeVisible()
})

testAsTeacher('teacher can analyze a submission and generate a remediation gate', async ({ page }) => {
  testAsTeacher.skip(
    !courseUuid() || !activityId() || !submissionUuid(),
    'Set E2E_COURSE_UUID, E2E_EXAM_ACTIVITY_ID, and E2E_SUBMISSION_UUID first.',
  )

  await page.goto(`/en/dash/courses/${courseUuid()}/activity/${activityId()}/review?submission=${submissionUuid()}`)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()

  await expect(page.getByText('Knowledge gaps: 1')).toBeVisible()
  await expect(page.getByText('Loop condition')).toBeVisible()
  await page.getByRole('button', { name: 'Generate remediation gate' }).click()
  await expect(page.getByText('Trace the loop exit')).toBeVisible()
  await expect(page.getByText('Gate mode is active until the learner passes.')).toBeVisible()
})

// ── v2 fixtures ─────────────────────────────────────────────────────────────

const IDS = {
  courseAnalysis: '01a0e2e0-0000-7000-8000-000000000001',
  courseRun: '01a0e2e0-0000-7000-8000-000000000002',
  submissionAnalysis: '01a0e2e0-0000-7000-8000-000000000003',
  submissionRun: '01a0e2e0-0000-7000-8000-000000000004',
  remediationRun: '01a0e2e0-0000-7000-8000-000000000005',
  remediationArtifact: '01a0e2e0-0000-7000-8000-000000000006',
  qaThread: '01a0e2e0-0000-7000-8000-000000000007',
  qaUserMessage: '01a0e2e0-0000-7000-8000-000000000008',
  qaAssistantMessage: '01a0e2e0-0000-7000-8000-000000000009',
  thread: '01a0e2e0-0000-7000-8000-00000000000a',
  user: '01a0e2e0-0000-7000-8000-00000000000b',
} as const

const NOW_UNIX = 1_789_200_000

const lessonCitation = {
  citation_id: 'lesson-1',
  label: 'Lesson 1',
  source_type: 'activity',
  source_uuid: '01a0e2e0-0000-7000-8000-00000000000c',
  excerpt: 'Worked example',
  confidence: 0.82,
}

/** `RunStatus` for a run that already finished (the controller settles from `GET /ai/runs/{id}`). */
function runStatus(id: string, kind: 'course_analysis' | 'submission_analysis' | 'remediation', status = 'succeeded') {
  return {
    id,
    thread_id: IDS.thread,
    kind,
    status,
    metadata: {},
    model_name: 'e2e-model',
    error_code: null,
    input_tokens: null,
    output_tokens: null,
    duration_ms: null,
    started_at_unix: NOW_UNIX,
    completed_at_unix: status === 'queued' ? null : NOW_UNIX,
  }
}

/** `CourseAnalysis` (`GET /ai/course-analysis/{course}/latest`, `POST …/{analysis}/publish`). */
function courseAnalysis(courseId: string, status: 'needs_human_review' | 'published') {
  return {
    id: IDS.courseAnalysis,
    course_id: courseId,
    run_id: IDS.courseRun,
    triggered_by: IDS.user,
    status,
    language: 'en',
    public_score: 82,
    report: {
      summary: 'Course analysis is ready for review.',
      confidence: 'medium',
      language: 'en',
      public_score: 82,
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
      citations: [lessonCitation],
    },
    evidence: { citations: [] },
    model_name: 'e2e-model',
    content_hash: 'e2e',
    stale: false,
    previous_public_score: null,
    created_at_unix: NOW_UNIX,
    published_at_unix: status === 'published' ? NOW_UNIX : null,
  }
}

/** `SubmissionAnalysis` (`GET /ai/submission-analysis/{submission}/latest`). */
function submissionAnalysis(submissionId: string) {
  return {
    id: IDS.submissionAnalysis,
    submission_id: submissionId,
    run_id: IDS.submissionRun,
    triggered_by: IDS.user,
    status: 'complete',
    language: 'en',
    gap_count: 1,
    analysis: {
      summary: 'One misconception needs remediation.',
      confidence: 'medium',
      language: 'en',
      next_action: 'Assign a short remediation.',
      knowledge_gaps: [
        {
          concept: 'Loop condition',
          evidence: 'The loop exits one iteration early.',
          severity: 'medium',
          remediation_goal: 'Practice tracing loop exits.',
        },
      ],
      citations: [],
    },
    evidence: { citations: [] },
    model_name: 'e2e-model',
    created_at_unix: NOW_UNIX,
  }
}

/** `RemediationBundle`: the remediation run's final `RunArtifact.content`. */
const remediationLecture = {
  title: 'Trace the loop exit',
  micro_lecture_markdown: 'Trace the loop one iteration at a time and write down the value that stops it.',
  learning_objectives: ['Identify the exit condition'],
  pass_threshold: 70,
  practice_questions: [],
  language: 'en',
  citations: [],
}

/** `QaMessage[]` (`GET /ai/qa/{course}/threads/{thread}`, oldest first). */
function qaTranscript(courseId: string) {
  const base = {
    thread_id: IDS.qaThread,
    course_id: courseId,
    user_id: IDS.user,
    client_turn_id: null,
    metadata: {},
    created_at_unix: NOW_UNIX,
  }
  return [
    {
      ...base,
      id: IDS.qaUserMessage,
      role: 'user',
      content: 'What should I review before the quiz?',
      confidence: null,
      citations: [],
    },
    {
      ...base,
      id: IDS.qaAssistantMessage,
      role: 'assistant',
      content: 'Review the worked example before the quiz.',
      confidence: 'medium',
      citations: { citations: [lessonCitation] },
    },
  ]
}

function sse(events: object[]) {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
}

/** `POST /ai/runs/{id}/stream`: `RUN_STARTED`, one `CUSTOM` per journal event, `RUN_FINISHED`. */
function runStream(runId: string) {
  return sse([
    { type: 'RUN_STARTED', threadId: IDS.thread, runId },
    { type: 'CUSTOM', name: 'collecting_context', value: { state: 'collecting_context', message: null, payload: {} } },
    { type: 'CUSTOM', name: 'checking_evidence', value: { state: 'checking_evidence', message: null, payload: {} } },
    { type: 'CUSTOM', name: 'finished', value: { state: 'complete', message: null, payload: {} } },
    { type: 'RUN_FINISHED', threadId: IDS.thread, runId },
  ])
}

/** `POST /ai/qa/{course}/chat` (`ai_agents.rs`): text, a `course_citations` tool result, then the thread id. */
function qaChatStream() {
  const toolCallId = 'tool_e2e'
  return sse([
    { type: 'RUN_STARTED', threadId: IDS.qaThread, runId: 'run_qa_e2e' },
    { type: 'TEXT_MESSAGE_START', messageId: IDS.qaAssistantMessage, role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: IDS.qaAssistantMessage, delta: 'Review the worked example before the quiz.' },
    { type: 'TEXT_MESSAGE_END', messageId: IDS.qaAssistantMessage },
    { type: 'TOOL_CALL_START', toolCallId, toolCallName: 'course_citations', parentMessageId: IDS.qaAssistantMessage },
    {
      type: 'TOOL_CALL_RESULT',
      messageId: 'msg_tool_e2e',
      toolCallId,
      content: JSON.stringify({ citations: [lessonCitation] }),
    },
    { type: 'TOOL_CALL_END', toolCallId },
    {
      type: 'RUN_FINISHED',
      threadId: IDS.qaThread,
      runId: 'run_qa_e2e',
      result: {
        thread_id: IDS.qaThread,
        message_id: IDS.qaAssistantMessage,
        confidence: 'medium',
        follow_up_suggestions: [],
      },
    },
  ])
}

function notFound(route: Route) {
  return route.fulfill({
    status: 404,
    contentType: 'application/problem+json',
    json: { type: 'about:blank', title: 'Not Found', status: 404, code: 'not-found', detail: 'not found' },
  })
}

async function mockAI(page: Page) {
  let courseAnalysisStatus: 'none' | 'needs_human_review' | 'published' = 'none'
  let submissionAnalysisReady = false
  let qaReady = false

  await page.route('**/api/v2/ai/**', route => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v2\/ai\//, '')
    const segments = path.split('/')
    const stream = (body: string) => route.fulfill({ contentType: 'text/event-stream', body })

    // course analysis: queue → run → latest → publish
    let match = /^course-analysis\/([^/]+)\/analyze\/queue$/.exec(path)
    if (match && method === 'POST') {
      courseAnalysisStatus = 'needs_human_review'
      return route.fulfill({ status: 202, json: runStatus(IDS.courseRun, 'course_analysis') })
    }
    match = /^course-analysis\/([^/]+)\/latest$/.exec(path)
    if (match) {
      return courseAnalysisStatus === 'none'
        ? notFound(route)
        : route.fulfill({ json: courseAnalysis(match[1]!, courseAnalysisStatus) })
    }
    match = /^course-analysis\/([^/]+)\/publish$/.exec(path)
    if (match && method === 'POST') {
      courseAnalysisStatus = 'published'
      return route.fulfill({ json: courseAnalysis(courseUuid(), 'published') })
    }

    // submission analysis + remediation: queue → run → latest / artifact
    match = /^submission-analysis\/([^/]+)\/analyze\/queue$/.exec(path)
    if (match && method === 'POST') {
      submissionAnalysisReady = true
      return route.fulfill({ status: 202, json: runStatus(IDS.submissionRun, 'submission_analysis') })
    }
    match = /^submission-analysis\/([^/]+)\/latest$/.exec(path)
    if (match) {
      return submissionAnalysisReady ? route.fulfill({ json: submissionAnalysis(match[1]!) }) : notFound(route)
    }
    if (/^remediation\/[^/]+\/generate\/queue$/.test(path) && method === 'POST') {
      return route.fulfill({ status: 202, json: runStatus(IDS.remediationRun, 'remediation') })
    }

    // runs: status / stream / artifacts
    if (segments[0] === 'runs' && segments[1]) {
      const runId = segments[1]
      const kind =
        runId === IDS.courseRun
          ? 'course_analysis'
          : runId === IDS.submissionRun
            ? 'submission_analysis'
            : runId === IDS.remediationRun
              ? 'remediation'
              : null
      if (!kind) return notFound(route)
      if (segments[2] === 'stream') return stream(runStream(runId))
      if (segments[2] === 'artifacts') {
        return route.fulfill({
          json:
            kind === 'remediation'
              ? [
                  {
                    id: IDS.remediationArtifact,
                    kind: 'remediation',
                    content: remediationLecture,
                    final: true,
                    created_at_unix: NOW_UNIX,
                  },
                ]
              : [],
        })
      }
      if (segments.length === 2) return route.fulfill({ json: runStatus(runId, kind) })
    }

    // course Q&A: chat stream → thread listing → transcript
    match = /^qa\/([^/]+)\/chat$/.exec(path)
    if (match && method === 'POST') {
      qaReady = true
      return stream(qaChatStream())
    }
    match = /^qa\/([^/]+)\/threads$/.exec(path)
    if (match) {
      return route.fulfill({
        json: qaReady
          ? [
              {
                id: IDS.qaThread,
                title: 'Quiz preparation',
                last_message_preview: 'Review the worked example before the quiz.',
                message_count: 2,
                updated_at_unix: NOW_UNIX,
              },
            ]
          : [],
      })
    }
    match = /^qa\/([^/]+)\/threads\/([^/]+)$/.exec(path)
    if (match && method === 'GET') {
      return match[2] === IDS.qaThread ? route.fulfill({ json: qaTranscript(match[1]!) }) : notFound(route)
    }

    // capabilities, study companion, usage, … — the local server answers those itself.
    return route.fallback()
  })
}
