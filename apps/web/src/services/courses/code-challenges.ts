import { apiJson } from '@/lib/api-client'
import { APIError, isApiError } from '@/lib/api/assertSuccess'
import type { AssessmentItem, ItemBody } from '@/features/assessments/domain/items'
import { getActivityAssessment } from '@/lib/api/generated/assessments/assessments'
import { itemBodyToWire, itemFromWire } from '@/features/assessments/domain/assessment-wire'
import { unixToIso } from '@/lib/api/contract'
import { codeGetRun, languages as fetchLanguages, runItem } from '@/lib/api/generated/code/code'
import { mySubmissions } from '@/lib/api/generated/submissions/submissions'
import type { CodeRun, StudentSubmission } from '@/lib/api/generated/zod'
import { idempotencyHeaders } from '@/lib/api/headers'

export interface CodeChallengeSettings {
  uuid: string
  title?: string
  prompt?: string
  input_spec?: string
  output_spec?: string
  constraints?: string[]
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD'
  time_limit?: number
  memory_limit?: number
  time_limit_ms?: number
  memory_limit_kb?: number
  max_submissions?: number
  grading_strategy: 'ALL_OR_NOTHING' | 'PARTIAL_CREDIT' | 'BEST_SUBMISSION' | 'LATEST_SUBMISSION'
  execution_mode?: 'FAST_FEEDBACK' | 'COMPLETE_FEEDBACK'
  allow_custom_input?: boolean
  points?: number
  allowed_languages: number[]
  visible_tests?: TestCase[]
  hidden_tests?: TestCase[]
  test_cases?: TestCase[]
  starter_code?: Record<string, string>
  solution_code?: Record<string, string>
  reference_solutions?: Record<string, string>
  hints?: { id?: string; order?: number; content: string; xp_penalty: number }[]
  lifecycle_status?: string
  scheduled_at?: string | null
  published_at?: string | null
  archived_at?: string | null
}

export interface TestCase {
  id: string
  input: string
  expected_output: string
  description?: string
  is_visible: boolean
  weight?: number
  points?: number
  match_mode?: 'EXACT' | 'TRIMMED' | 'IGNORE_WHITESPACE' | 'NUMERIC_TOLERANCE' | 'CUSTOM_CHECKER'
}

/** One attempt of the code challenge as the learner sees it (v2 `StudentSubmission`, code-specific view). */
export interface CodeSubmission {
  id: string
  attempt_number: number
  status: StudentSubmission['status']
  /** `null` until the grade is released. */
  score: number | null
  max_score: number
  language_id: number
  submitted_at_unix: number | null
}

function serviceError(code: string, message: string, status = 0): APIError {
  return new APIError({
    code,
    message,
    status,
  })
}

export interface TestCaseResult {
  test_case_id: string
  status: number
  status_id?: number | null
  status_description: string
  passed: boolean
  is_visible?: boolean
  description?: string | null
  weight?: number | null
  time_ms?: number | null
  memory_kb?: number | null
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
  message?: string | null
  expected?: string | null
  stdin?: string | null
}

export interface Judge0Language {
  id: number
  name: string
  monaco_language: string
  /** v2's `GET /code/languages` already filters to the allowed, non-archived set. */
  is_archived?: boolean
}

interface CodeAssessmentItemBody {
  kind: 'CODE'
  prompt?: string
  input_spec?: string
  output_spec?: string
  constraints?: string[]
  languages?: number[]
  starter_code?: Record<string, string>
  reference_solutions?: Record<string, string>
  tests?: TestCase[]
  time_limit_seconds?: number | null
  memory_limit_mb?: number | null
}

interface CodeAssessmentItem {
  item_uuid: string
  kind: string
  title: string
  max_score: number
  body: CodeAssessmentItemBody
}

interface CodeAssessmentRead {
  assessment_uuid: string
  title: string
  description?: string
  lifecycle?: string
  scheduled_at?: string | null
  published_at?: string | null
  archived_at?: string | null
  assessment_policy?: {
    settings_json?: Record<string, unknown>
  } | null
  items?: AssessmentItem[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'number')

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(entry => typeof entry === 'string')

const isDifficulty = (value: unknown): value is NonNullable<CodeChallengeSettings['difficulty']> =>
  value === 'EASY' || value === 'MEDIUM' || value === 'HARD'

const isGradingStrategy = (value: unknown): value is CodeChallengeSettings['grading_strategy'] =>
  value === 'ALL_OR_NOTHING' ||
  value === 'PARTIAL_CREDIT' ||
  value === 'BEST_SUBMISSION' ||
  value === 'LATEST_SUBMISSION'

const isExecutionMode = (value: unknown): value is NonNullable<CodeChallengeSettings['execution_mode']> =>
  value === 'FAST_FEEDBACK' || value === 'COMPLETE_FEEDBACK'

const isTestCase = (value: unknown): value is TestCase => {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.input === 'string' &&
    typeof value.expected_output === 'string' &&
    typeof value.is_visible === 'boolean'
  )
}

const isTestCaseArray = (value: unknown): value is TestCase[] => Array.isArray(value) && value.every(isTestCase)

type CodeChallengeHint = NonNullable<CodeChallengeSettings['hints']>[number]

const isHint = (value: unknown): value is CodeChallengeHint => {
  if (!isRecord(value)) return false

  return (
    typeof value.content === 'string' &&
    typeof value.xp_penalty === 'number' &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.order === undefined || typeof value.order === 'number')
  )
}

const isHintArray = (value: unknown): value is CodeChallengeHint[] => Array.isArray(value) && value.every(isHint)

export async function getJudge0Languages(): Promise<Judge0Language[]> {
  return fetchLanguages()
}

async function loadCodeAssessment(activityUuid: string): Promise<CodeAssessmentRead | null> {
  try {
    const assessment = await getActivityAssessment(activityUuid.replace(/^activity_/, ''))
    return {
      assessment_uuid: assessment.id,
      title: assessment.title,
      description: assessment.description,
      lifecycle: assessment.lifecycle,
      scheduled_at: unixToIso(assessment.scheduled_at_unix),
      published_at: unixToIso(assessment.published_at_unix),
      archived_at: unixToIso(assessment.archived_at_unix),
      // v2 has no policy settings_json bucket; code-challenge-specific fields
      // (difficulty/execution_mode/hints/max_submissions/allow_custom_input)
      // have no wire home and fall back to `toCodeChallengeSettings`'s
      // defaults — see report under "Blocked".
      assessment_policy: null,
      items: assessment.items.map(itemFromWire),
    }
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null
    throw error
  }
}

function getCodeAssessmentItem(assessment: CodeAssessmentRead | null): CodeAssessmentItem | null {
  const item = assessment?.items?.find(entry => entry.kind === 'CODE')
  return (item as CodeAssessmentItem | undefined) ?? null
}

function codeRunIdempotencyKey(
  assessmentUuid: string,
  itemUuid: string,
  languageId: number,
  sourceCode: string,
  customInput?: string,
) {
  const raw = `${assessmentUuid}:${itemUuid}:${languageId}:${sourceCode}:${customInput ?? ''}`
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = Math.imul(31, hash) + raw.charCodeAt(index)
  }
  return `code-run-${Math.abs(hash)}`
}

function toReadableTestCase(test: TestCase): TestCase {
  const resolvedPoints = test.points ?? test.weight

  return {
    id: test.id,
    input: test.input,
    expected_output: test.expected_output,
    is_visible: test.is_visible,
    match_mode: test.match_mode ?? 'EXACT',
    ...(test.description !== undefined ? { description: test.description } : {}),
    ...(test.weight !== undefined ? { weight: test.weight } : {}),
    ...(resolvedPoints !== undefined ? { points: resolvedPoints } : {}),
  }
}

function toStoredTestCase(test: TestCase, isVisible: boolean): TestCase {
  const { points } = test

  return {
    id: test.id,
    input: test.input,
    expected_output: test.expected_output,
    is_visible: isVisible,
    weight: test.weight ?? test.points ?? 1,
    match_mode: test.match_mode ?? 'EXACT',
    ...(test.description !== undefined ? { description: test.description } : {}),
    ...(points !== undefined ? { points } : {}),
  }
}

function toCodeChallengeSettings(
  assessment: CodeAssessmentRead,
  codeItem: CodeAssessmentItem | null,
): CodeChallengeSettings {
  const settings = assessment.assessment_policy?.settings_json ?? {}
  const body = codeItem?.body
  const bodyTests = Array.isArray(body?.tests) ? body.tests : []
  const settingsVisibleTests = isTestCaseArray(settings.visible_tests) ? settings.visible_tests : []
  const settingsHiddenTests = isTestCaseArray(settings.hidden_tests) ? settings.hidden_tests : []
  const visibleTests = bodyTests.length
    ? bodyTests.filter(test => test.is_visible).map(toReadableTestCase)
    : settingsVisibleTests
  const hiddenTests = bodyTests.length
    ? bodyTests.filter(test => !test.is_visible).map(toReadableTestCase)
    : settingsHiddenTests
  const timeLimit =
    typeof body?.time_limit_seconds === 'number'
      ? body.time_limit_seconds
      : typeof settings.time_limit === 'number'
        ? settings.time_limit
        : 5
  const memoryLimit =
    typeof body?.memory_limit_mb === 'number'
      ? body.memory_limit_mb
      : typeof settings.memory_limit === 'number'
        ? settings.memory_limit
        : 256
  const maxSubmissions = typeof settings.max_submissions === 'number' ? settings.max_submissions : undefined
  const allowedLanguages = Array.isArray(body?.languages)
    ? body.languages
    : isNumberArray(settings.allowed_languages)
      ? settings.allowed_languages
      : []
  const starterCode = body?.starter_code ?? (isStringRecord(settings.starter_code) ? settings.starter_code : {})
  const referenceSolutions =
    body?.reference_solutions ?? (isStringRecord(settings.reference_solutions) ? settings.reference_solutions : {})
  const solutionCode = isStringRecord(settings.solution_code)
    ? settings.solution_code
    : typeof settings.reference_solution === 'string'
      ? { solution: settings.reference_solution }
      : undefined
  const difficulty: NonNullable<CodeChallengeSettings['difficulty']> = isDifficulty(settings.difficulty)
    ? settings.difficulty
    : 'EASY'
  const executionMode: NonNullable<CodeChallengeSettings['execution_mode']> = isExecutionMode(settings.execution_mode)
    ? settings.execution_mode
    : 'COMPLETE_FEEDBACK'
  const hints = isHintArray(settings.hints) ? settings.hints : []
  const points =
    typeof codeItem?.max_score === 'number'
      ? codeItem.max_score
      : typeof settings.points === 'number'
        ? settings.points
        : 100

  return {
    uuid: assessment.assessment_uuid,
    prompt: body?.prompt ?? assessment.description ?? '',
    input_spec: body?.input_spec ?? '',
    output_spec: body?.output_spec ?? '',
    constraints: Array.isArray(body?.constraints) ? body.constraints : [],
    difficulty,
    time_limit: timeLimit,
    memory_limit: memoryLimit,
    time_limit_ms: timeLimit * 1000,
    memory_limit_kb: memoryLimit * 1024,
    grading_strategy: isGradingStrategy(settings.grading_strategy) ? settings.grading_strategy : 'PARTIAL_CREDIT',
    execution_mode: executionMode,
    allow_custom_input: typeof settings.allow_custom_input === 'boolean' ? settings.allow_custom_input : true,
    points,
    allowed_languages: allowedLanguages,
    visible_tests: visibleTests,
    hidden_tests: hiddenTests,
    test_cases: [...visibleTests, ...hiddenTests],
    starter_code: starterCode,
    reference_solutions: referenceSolutions,
    hints,
    scheduled_at: assessment.scheduled_at ?? null,
    published_at: assessment.published_at ?? null,
    archived_at: assessment.archived_at ?? null,
    ...(assessment.lifecycle === undefined ? {} : { lifecycle_status: assessment.lifecycle }),
    ...(assessment.title === undefined ? {} : { title: assessment.title }),
    ...(maxSubmissions !== undefined ? { max_submissions: maxSubmissions } : {}),
    ...(solutionCode ? { solution_code: solutionCode } : {}),
  }
}

function toCodeItemBody(
  assessment: CodeAssessmentRead,
  codeItem: CodeAssessmentItem | null,
  settings: Partial<CodeChallengeSettings>,
): CodeAssessmentItemBody {
  const existingBody = codeItem?.body
  const prompt =
    typeof settings.prompt === 'string'
      ? settings.prompt
      : typeof existingBody?.prompt === 'string' && existingBody.prompt.trim().length > 0
        ? existingBody.prompt
        : assessment.description?.trim() || assessment.title
  const visibleTests = Array.isArray(settings.visible_tests) ? settings.visible_tests : []
  const hiddenTests = Array.isArray(settings.hidden_tests) ? settings.hidden_tests : []

  return {
    kind: 'CODE',
    prompt,
    input_spec: typeof settings.input_spec === 'string' ? settings.input_spec : (existingBody?.input_spec ?? ''),
    output_spec: typeof settings.output_spec === 'string' ? settings.output_spec : (existingBody?.output_spec ?? ''),
    constraints: Array.isArray(settings.constraints) ? settings.constraints : (existingBody?.constraints ?? []),
    languages: settings.allowed_languages ?? existingBody?.languages ?? [],
    starter_code: settings.starter_code ?? existingBody?.starter_code ?? {},
    reference_solutions: settings.reference_solutions ?? existingBody?.reference_solutions ?? {},
    tests: [
      ...visibleTests.map(test => toStoredTestCase(test, true)),
      ...hiddenTests.map(test => toStoredTestCase(test, false)),
    ],
    time_limit_seconds:
      typeof settings.time_limit === 'number' ? settings.time_limit : (existingBody?.time_limit_seconds ?? null),
    memory_limit_mb:
      typeof settings.memory_limit === 'number' ? settings.memory_limit : (existingBody?.memory_limit_mb ?? null),
  }
}

async function upsertCodeItem(assessment: CodeAssessmentRead, settings: Partial<CodeChallengeSettings>) {
  const codeItem = getCodeAssessmentItem(assessment)
  const body = toCodeItemBody(assessment, codeItem, settings)
  const payload = {
    // The server creates a new challenge's code item with title ""; PATCH rejects a blank title.
    title: codeItem?.title?.trim() || assessment.title,
    body: itemBodyToWire(body as ItemBody),
    max_score: typeof settings.points === 'number' ? settings.points : (codeItem?.max_score ?? 100),
  }

  if (codeItem) {
    await apiJson(`assessment-items/${codeItem.item_uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return
  }

  await apiJson(`assessments/${assessment.assessment_uuid}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function toCodeSubmission(raw: StudentSubmission): CodeSubmission {
  const codeAnswer = Object.values(raw.answers).find(answer => answer.kind === 'code')
  return {
    id: raw.id,
    attempt_number: raw.attempt_number,
    status: raw.status,
    score: raw.final_score ?? raw.auto_score ?? null,
    max_score: 100,
    language_id: codeAnswer?.kind === 'code' ? codeAnswer.language : 0,
    submitted_at_unix: raw.submitted_at_unix ?? raw.started_at_unix ?? null,
  }
}

export async function getCodeChallengeSettings(activityUuid: string): Promise<CodeChallengeSettings | null> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    return null
  }
  return toCodeChallengeSettings(assessment, getCodeAssessmentItem(assessment))
}

export async function saveCodeChallengeSettings(
  activityUuid: string,
  settings: Partial<CodeChallengeSettings>,
): Promise<CodeChallengeSettings> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    throw serviceError('CODE_CHALLENGE_NOT_FOUND', 'Code challenge assessment not found', 404)
  }

  // v2's `UpdateAssessmentRequest` has no `policy.settings_json` bucket (the
  // legacy free-form settings bag doesn't exist on the wire); only `title`
  // has a real v2 home here, so that's all that's patched at the assessment
  // level. Difficulty/execution_mode/hints/max_submissions/allow_custom_input
  // have nowhere to persist — see report under "Blocked".
  if (settings.title !== undefined) {
    await apiJson(`assessments/${assessment.assessment_uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: settings.title }),
    })
  }

  await upsertCodeItem(assessment, settings)

  const refreshed = await loadCodeAssessment(activityUuid)
  if (!refreshed) {
    throw serviceError('CODE_CHALLENGE_RELOAD_FAILED', 'Failed to reload code challenge settings')
  }
  return toCodeChallengeSettings(refreshed, getCodeAssessmentItem(refreshed))
}

const CODE_RUN_POLL_MS = 1000

/**
 * `POST assessment-items/{id}/runs` executes inside the request, but the
 * contract allows a `queued`/`running` answer; follow it on `GET code-runs/{id}`
 * until terminal so callers only ever see a settled run.
 */
export async function awaitCodeRun(run: CodeRun): Promise<CodeRun> {
  let current = run
  while (current.status === 'queued' || current.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, CODE_RUN_POLL_MS))
    current = await codeGetRun(current.id)
  }
  return current
}

function codeRunToCanonical(run: CodeRun): CanonicalCodeRunResponse {
  const firstCase = run.cases[0]
  return {
    status: run.status.toUpperCase(),
    passed: run.passed,
    total: run.total,
    ...(run.compile_output ? { compile_output: run.compile_output } : {}),
    ...(run.error_message ? { error_message: run.error_message } : {}),
    ...(firstCase?.stdout ? { stdout: firstCase.stdout } : {}),
    ...(firstCase?.stderr ? { stderr: firstCase.stderr } : {}),
    ...(firstCase?.time_seconds !== undefined && firstCase.time_seconds !== null
      ? { time: firstCase.time_seconds }
      : {}),
    ...(firstCase?.memory_kb !== undefined && firstCase.memory_kb !== null ? { memory: firstCase.memory_kb } : {}),
    visible_results: run.cases.map(caseResult => ({
      test_id: caseResult.test_id,
      passed: caseResult.passed,
      status_id: caseResult.status_id ?? null,
      status_description: caseResult.status_description,
      description: caseResult.description ?? null,
      weight: caseResult.weight ?? null,
      ...(caseResult.stdin ? { stdin: caseResult.stdin } : {}),
      ...(caseResult.expected ? { expected: caseResult.expected } : {}),
      ...(caseResult.actual ? { actual: caseResult.actual } : {}),
      ...(caseResult.time_seconds !== undefined && caseResult.time_seconds !== null
        ? { time: caseResult.time_seconds }
        : {}),
      ...(caseResult.memory_kb !== undefined && caseResult.memory_kb !== null ? { memory: caseResult.memory_kb } : {}),
    })),
  }
}

export async function runTests(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<{ results: TestCaseResult[] }> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    throw serviceError('CODE_CHALLENGE_NOT_FOUND', 'Code challenge assessment not found', 404)
  }

  const codeItem = getCodeAssessmentItem(assessment)
  if (!codeItem) {
    throw serviceError('CODE_CHALLENGE_ITEM_NOT_CONFIGURED', 'Code challenge item is not configured', 422)
  }

  const run = codeRunToCanonical(
    await awaitCodeRun(
      await runItem(
        codeItem.item_uuid,
        { language_id: languageId, source: sourceCode },
        {
          headers: idempotencyHeaders(
            codeRunIdempotencyKey(assessment.assessment_uuid, codeItem.item_uuid, languageId, sourceCode),
          ),
        },
      ),
    ),
  )

  if (run.status === 'DEGRADED') {
    throw serviceError('code-runner-degraded', run.error_message || 'Code runner is temporarily unavailable', 503)
  }

  return {
    results: run.visible_results.map((result, index) => toTestCaseResult(result, index, run)),
  }
}

export async function runCustomTest(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
  stdin: string,
): Promise<{
  stdout?: string
  stderr?: string
  compile_output?: string
  status: number
  status_description: string
  time_ms?: number
  memory_kb?: number
}> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    throw serviceError('CODE_CHALLENGE_NOT_FOUND', 'Code challenge assessment not found', 404)
  }

  const codeItem = getCodeAssessmentItem(assessment)
  if (!codeItem) {
    throw serviceError('CODE_CHALLENGE_ITEM_NOT_CONFIGURED', 'Code challenge item is not configured', 422)
  }

  const run = codeRunToCanonical(
    await awaitCodeRun(
      await runItem(
        codeItem.item_uuid,
        { language_id: languageId, source: sourceCode, custom_input: stdin },
        {
          headers: idempotencyHeaders(
            codeRunIdempotencyKey(assessment.assessment_uuid, codeItem.item_uuid, languageId, sourceCode, stdin),
          ),
        },
      ),
    ),
  )

  if (run.status === 'DEGRADED') {
    throw serviceError('code-runner-degraded', run.error_message || 'Code runner is temporarily unavailable', 503)
  }

  return {
    status: runStatusCode(run.status, run.passed, run.total),
    status_description: run.status,
    ...(run.stdout !== null && run.stdout !== undefined ? { stdout: run.stdout } : {}),
    ...(run.stderr !== null && run.stderr !== undefined ? { stderr: run.stderr } : {}),
    ...(run.compile_output !== null && run.compile_output !== undefined ? { compile_output: run.compile_output } : {}),
    ...(typeof run.time === 'number' ? { time_ms: Math.round(run.time * 1000) } : {}),
    ...(typeof run.memory === 'number' ? { memory_kb: run.memory } : {}),
  }
}

/** The learner's attempts, newest first (`GET assessments/{id}/submissions/me`). */
export async function getSubmissions(activityUuid: string): Promise<CodeSubmission[]> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    return []
  }

  return (await mySubmissions(assessment.assessment_uuid))
    .map(toCodeSubmission)
    .toSorted((a, b) => b.attempt_number - a.attempt_number)
}

interface CanonicalCodeRunTestResult {
  test_id: string
  passed: boolean
  status_id?: number | null
  status_description?: string | null
  description?: string | null
  weight?: number | null
  stdin?: string | null
  expected?: string | null
  actual?: string | null
  time?: number | null
  memory?: number | null
}

interface CanonicalCodeRunResponse {
  status: string
  passed: number
  total: number
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
  time?: number | null
  memory?: number | null
  visible_results: CanonicalCodeRunTestResult[]
  error_message?: string | null
}

function toTestCaseResult(
  result: CanonicalCodeRunTestResult,
  index: number,
  run: CanonicalCodeRunResponse,
): TestCaseResult {
  return {
    test_case_id: result.test_id || `visible_${index + 1}`,
    status: result.passed ? 3 : runStatusCode(run.status, run.passed, run.total),
    status_id: result.status_id ?? null,
    status_description: result.status_description ?? (result.passed ? 'Accepted' : run.status),
    passed: result.passed,
    is_visible: true,
    description: result.description ?? null,
    weight: result.weight ?? null,
    time_ms: typeof result.time === 'number' ? Math.round(result.time * 1000) : null,
    memory_kb: typeof result.memory === 'number' ? result.memory : null,
    stdout: result.actual ?? run.stdout ?? null,
    stderr: run.stderr ?? null,
    compile_output: run.compile_output ?? null,
    expected: result.expected ?? null,
    stdin: result.stdin ?? null,
  }
}

function runStatusCode(status: string, passed: number, total: number) {
  const normalized = status.toUpperCase()
  if (normalized.includes('COMPILE')) return 6
  if (normalized.includes('TIMEOUT') || normalized.includes('TIME_LIMIT')) return 5
  if (normalized.includes('RUNTIME')) return 11
  if (total > 0 && passed < total) return 4
  return 3
}
