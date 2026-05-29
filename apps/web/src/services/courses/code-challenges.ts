import { apiFetch } from '@/lib/api-client'
import type {
  Submission as GradingSubmission,
  SubmissionStatus as CanonicalSubmissionStatus,
} from '@/features/grading/domain'
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items'

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

export interface CodeSubmission {
  uuid: string
  submission_uuid?: string
  submission_status?: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED' | null
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING_JUDGE0'
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'error'
  score?: number
  max_score?: number
  language_id: number
  created_at: string
  results?: TestCaseResult[]
}

interface CanonicalRunRecord {
  language_id?: number
  details?: TestCaseResult[]
}

interface CanonicalMetadata {
  judge0_state?: string
  latest_run?: CanonicalRunRecord | null
}

interface CanonicalSubmissionRead {
  submission_uuid: string
  created_at: string
  status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED'
  final_score?: number | null
  auto_score?: number | null
  answers_json?: { answers?: Record<string, ItemAnswer> } | Record<string, unknown> | null
  metadata_json?: Record<string, unknown> | null
}

type CanonicalCodeAnswer = Extract<ItemAnswer, { kind: 'CODE' }>

export interface CodeChallengeDraft {
  id: number
  submission_uuid: string
  status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED'
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
  is_archived: boolean
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

const readCanonicalMetadata = (value: CanonicalSubmissionRead['metadata_json']): CanonicalMetadata => {
  if (!isRecord(value)) return {}

  const latestRunValue = value.latest_run
  const latestRun = isRecord(latestRunValue)
    ? {
        ...(typeof latestRunValue.language_id === 'number' ? { language_id: latestRunValue.language_id } : {}),
        ...(Array.isArray(latestRunValue.details) ? { details: latestRunValue.details as TestCaseResult[] } : {}),
      }
    : null

  return {
    ...(typeof value.judge0_state === 'string' ? { judge0_state: value.judge0_state } : {}),
    ...(latestRun ? { latest_run: latestRun } : {}),
  }
}

const readCodeAnswers = (value: CanonicalSubmissionRead['answers_json']) => {
  if (!isRecord(value)) return {}

  const answersValue = value.answers
  if (!isRecord(answersValue)) return {}

  const entries = Object.entries(answersValue).filter(([, answer]) => isRecord(answer) && answer.kind === 'CODE')

  return Object.fromEntries(entries) as Record<string, CanonicalCodeAnswer>
}

function normalizeActivityUuid(activityUuid: string) {
  return activityUuid.startsWith('activity_') ? activityUuid : `activity_${activityUuid}`
}

export async function getJudge0Languages(): Promise<Judge0Language[]> {
  const response = await apiFetch('code-execution/languages')
  if (!response.ok) {
    throw new Error('Failed to fetch code execution languages')
  }
  return (await response.json()) as Judge0Language[]
}

async function loadCodeAssessment(activityUuid: string): Promise<CodeAssessmentRead | null> {
  const response = await apiFetch(`assessments/activity/${normalizeActivityUuid(activityUuid)}`)

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Failed to fetch code challenge assessment')
  }

  return (await response.json()) as CodeAssessmentRead
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
    kind: 'CODE',
    title: codeItem?.title ?? assessment.title,
    body,
    max_score: typeof settings.points === 'number' ? settings.points : (codeItem?.max_score ?? 100),
  }

  if (codeItem) {
    const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${codeItem.item_uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail || 'Failed to update code challenge item')
    }
    return
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to create code challenge item')
  }
}

function normalizeJudge0State(
  judge0State: unknown,
  submissionStatus: CanonicalSubmissionStatus,
): CodeSubmission['status'] {
  if (typeof judge0State === 'string' && judge0State.length > 0) {
    return judge0State.toUpperCase() as CodeSubmission['status']
  }
  if (submissionStatus === 'DRAFT' || submissionStatus === 'PENDING') return 'PENDING'
  return 'COMPLETED'
}

function mapCanonicalCodeSubmission(raw: GradingSubmission): CodeSubmission {
  const metadata = readCanonicalMetadata(raw.metadata_json)
  const answerMap = readCodeAnswers(raw.answers_json)
  const firstCodeAnswer = Object.values(answerMap).find(answer => answer?.kind === 'CODE')
  const results = Array.isArray(metadata.latest_run?.details) ? metadata.latest_run.details : undefined

  return {
    uuid: raw.submission_uuid,
    submission_uuid: raw.submission_uuid,
    submission_status: raw.status,
    status: normalizeJudge0State(metadata.judge0_state, raw.status),
    max_score: 100,
    language_id:
      typeof firstCodeAnswer?.language === 'number'
        ? firstCodeAnswer.language
        : typeof metadata.latest_run?.language_id === 'number'
          ? metadata.latest_run.language_id
          : 0,
    created_at: raw.created_at,
    ...(typeof raw.final_score === 'number'
      ? { score: raw.final_score }
      : raw.auto_score !== null && raw.auto_score !== undefined
        ? { score: raw.auto_score }
        : {}),
    ...(results ? { results } : {}),
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
    throw new Error('Code challenge assessment not found')
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policy: {
        settings_json: {
          ...assessment.assessment_policy?.settings_json,
          ...settings,
        },
      },
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to save code challenge settings')
  }

  await upsertCodeItem(assessment, settings)

  const refreshed = await loadCodeAssessment(activityUuid)
  if (!refreshed) {
    throw new Error('Failed to reload code challenge settings')
  }
  return toCodeChallengeSettings(refreshed, getCodeAssessmentItem(refreshed))
}

export async function submitCode(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<CodeSubmission> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    throw new Error('Code challenge assessment not found')
  }

  const codeItem = getCodeAssessmentItem(assessment)
  if (!codeItem) {
    throw new Error('Code challenge item is not configured')
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: [
        {
          item_uuid: codeItem.item_uuid,
          answer: {
            kind: 'CODE',
            language: languageId,
            source: sourceCode,
          },
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to submit code')
  }

  return mapCanonicalCodeSubmission((await response.json()) as GradingSubmission)
}

export async function runTests(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<{ results: TestCaseResult[] }> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    throw new Error('Code challenge assessment not found')
  }

  const codeItem = getCodeAssessmentItem(assessment)
  if (!codeItem) {
    throw new Error('Code challenge item is not configured')
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${codeItem.item_uuid}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: languageId,
      source: sourceCode,
      idempotency_key: codeRunIdempotencyKey(assessment.assessment_uuid, codeItem.item_uuid, languageId, sourceCode),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail?.message || error.detail || 'Failed to run code challenge tests')
  }

  const run = (await response.json()) as CanonicalCodeRunResponse
  if (run.status === 'DEGRADED') {
    throw new Error(run.error_message || 'Code runner is temporarily unavailable')
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
    throw new Error('Code challenge assessment not found')
  }

  const codeItem = getCodeAssessmentItem(assessment)
  if (!codeItem) {
    throw new Error('Code challenge item is not configured')
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${codeItem.item_uuid}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: languageId,
      source: sourceCode,
      custom_input: stdin,
      idempotency_key: codeRunIdempotencyKey(
        assessment.assessment_uuid,
        codeItem.item_uuid,
        languageId,
        sourceCode,
        stdin,
      ),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail?.message || error.detail || 'Failed to run custom test')
  }

  const run = (await response.json()) as CanonicalCodeRunResponse
  if (run.status === 'DEGRADED') {
    throw new Error(run.error_message || 'Code runner is temporarily unavailable')
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

export async function getSubmission(activityUuid: string, submissionUuid: string): Promise<CodeSubmission> {
  const submissions = await getSubmissions(activityUuid)
  const submission = submissions.find(item => item.submission_uuid === submissionUuid || item.uuid === submissionUuid)
  if (!submission) {
    throw new Error('Failed to fetch submission')
  }
  return submission
}

export async function getSubmissions(activityUuid: string): Promise<CodeSubmission[]> {
  const assessment = await loadCodeAssessment(activityUuid)
  if (!assessment) {
    return []
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/me`)

  if (!response.ok) {
    throw new Error('Failed to fetch submissions')
  }

  return ((await response.json()) as CanonicalSubmissionRead[] as unknown as GradingSubmission[]).map(
    mapCanonicalCodeSubmission,
  )
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
