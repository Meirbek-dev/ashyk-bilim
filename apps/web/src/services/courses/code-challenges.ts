import { apiFetch } from '@/lib/api-client';
import type {
  Submission as GradingSubmission,
  SubmissionStatus as CanonicalSubmissionStatus,
} from '@/features/grading/domain';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';

export interface CodeChallengeSettings {
  uuid: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  time_limit?: number;
  memory_limit?: number;
  time_limit_ms?: number;
  memory_limit_kb?: number;
  max_submissions?: number;
  grading_strategy: 'ALL_OR_NOTHING' | 'PARTIAL_CREDIT' | 'BEST_SUBMISSION' | 'LATEST_SUBMISSION';
  execution_mode?: 'FAST_FEEDBACK' | 'COMPLETE_FEEDBACK';
  allow_custom_input?: boolean;
  points?: number;
  allowed_languages: number[];
  visible_tests?: TestCase[];
  hidden_tests?: TestCase[];
  test_cases?: TestCase[];
  starter_code?: Record<string, string>;
  solution_code?: Record<string, string>;
  hints?: { id?: string; order?: number; content: string; xp_penalty: number }[];
  lifecycle_status?: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
}

export interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
  points?: number;
}

export interface CodeSubmission {
  uuid: string;
  submission_uuid?: string;
  submission_status?: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED' | null;
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
    | 'error';
  score?: number;
  max_score?: number;
  language_id: number;
  created_at: string;
  results?: TestCaseResult[];
  test_results?: { results?: TestCaseResult[] };
}

interface CanonicalRunRecord {
  language_id?: number;
  details?: TestCaseResult[];
}

interface CanonicalMetadata {
  judge0_state?: string;
  latest_run?: CanonicalRunRecord | null;
}

interface CanonicalAnswers {
  language_id?: number;
}

interface CanonicalSubmissionRead {
  submission_uuid: string;
  created_at: string;
  status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
  final_score?: number | null;
  auto_score?: number | null;
  answers_json?: { answers?: Record<string, ItemAnswer> } | Record<string, unknown> | null;
  metadata_json?: Record<string, unknown> | null;
}

type CanonicalCodeAnswer = Extract<ItemAnswer, { kind: 'CODE' }>;

export interface CodeChallengeDraft {
  id: number;
  submission_uuid: string;
  status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
}

export interface TestCaseResult {
  test_case_id: string;
  status: number;
  status_description: string;
  passed: boolean;
  time_ms?: number | null;
  memory_kb?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
}

export interface Judge0Language {
  id: number;
  name: string;
}

interface CodeAssessmentItemBody {
  kind: 'CODE';
  prompt?: string;
  languages?: number[];
  starter_code?: Record<string, string>;
  tests?: TestCase[];
  time_limit_seconds?: number | null;
  memory_limit_mb?: number | null;
}

interface CodeAssessmentItem {
  item_uuid: string;
  kind: string;
  title: string;
  max_score: number;
  body: CodeAssessmentItemBody;
}

interface CodeAssessmentRead {
  assessment_uuid: string;
  title: string;
  description?: string;
  lifecycle?: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  assessment_policy?: {
    settings_json?: Record<string, unknown>;
  } | null;
  items?: AssessmentItem[];
}

function decodeLegacyEditorPayload(value: string) {
  const normalized = value.trim();

  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    return value;
  }

  try {
    const decoded = atob(normalized);
    return btoa(decoded) === normalized ? decoded : value;
  } catch {
    return value;
  }
}

function normalizeActivityUuid(activityUuid: string) {
  return activityUuid.startsWith('activity_') ? activityUuid : `activity_${activityUuid}`;
}

async function loadCodeAssessment(activityUuid: string): Promise<CodeAssessmentRead | null> {
  const response = await apiFetch(`assessments/activity/${normalizeActivityUuid(activityUuid)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to fetch code challenge assessment');
  }

  return (await response.json()) as CodeAssessmentRead;
}

function getCodeAssessmentItem(assessment: CodeAssessmentRead | null): CodeAssessmentItem | null {
  const item = assessment?.items?.find((entry) => entry.kind === 'CODE');
  return (item as CodeAssessmentItem | undefined) ?? null;
}

function codeRunIdempotencyKey(
  assessmentUuid: string,
  itemUuid: string,
  languageId: number,
  sourceCode: string,
  customInput?: string,
) {
  const raw = `${assessmentUuid}:${itemUuid}:${languageId}:${sourceCode}:${customInput ?? ''}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = Math.imul(31, hash) + raw.charCodeAt(index);
  }
  return `code-run-${Math.abs(hash)}`;
}

function toReadableTestCase(test: TestCase): TestCase {
  return {
    id: test.id,
    input: test.input,
    expected_output: test.expected_output,
    description: test.description,
    is_visible: test.is_visible,
    weight: test.weight,
    points: test.points ?? test.weight,
  };
}

function toStoredTestCase(test: TestCase, isVisible: boolean): TestCase {
  return {
    id: test.id,
    input: test.input,
    expected_output: test.expected_output,
    description: test.description,
    is_visible: isVisible,
    weight: test.weight ?? test.points ?? 1,
    points: test.points,
  };
}

function toCodeChallengeSettings(
  assessment: CodeAssessmentRead,
  codeItem: CodeAssessmentItem | null,
): CodeChallengeSettings {
  const settings = assessment.assessment_policy?.settings_json ?? {};
  const body = codeItem?.body;
  const bodyTests = Array.isArray(body?.tests) ? body.tests : [];
  const settingsVisibleTests = Array.isArray(settings.visible_tests) ? (settings.visible_tests as TestCase[]) : [];
  const settingsHiddenTests = Array.isArray(settings.hidden_tests) ? (settings.hidden_tests as TestCase[]) : [];
  const visibleTests = bodyTests.length
    ? bodyTests.filter((test) => test.is_visible).map(toReadableTestCase)
    : settingsVisibleTests;
  const hiddenTests = bodyTests.length
    ? bodyTests.filter((test) => !test.is_visible).map(toReadableTestCase)
    : settingsHiddenTests;
  const timeLimit =
    typeof body?.time_limit_seconds === 'number'
      ? body.time_limit_seconds
      : typeof settings.time_limit === 'number'
        ? settings.time_limit
        : 5;
  const memoryLimit =
    typeof body?.memory_limit_mb === 'number'
      ? body.memory_limit_mb
      : typeof settings.memory_limit === 'number'
        ? settings.memory_limit
        : 256;

  return {
    uuid: assessment.assessment_uuid,
    difficulty: (settings.difficulty as CodeChallengeSettings['difficulty'] | undefined) ?? 'EASY',
    time_limit: timeLimit,
    memory_limit: memoryLimit,
    time_limit_ms: timeLimit * 1000,
    memory_limit_kb: memoryLimit * 1024,
    max_submissions: typeof settings.max_submissions === 'number' ? settings.max_submissions : undefined,
    grading_strategy:
      (settings.grading_strategy as CodeChallengeSettings['grading_strategy'] | undefined) ?? 'PARTIAL_CREDIT',
    execution_mode:
      (settings.execution_mode as CodeChallengeSettings['execution_mode'] | undefined) ?? 'COMPLETE_FEEDBACK',
    allow_custom_input: typeof settings.allow_custom_input === 'boolean' ? settings.allow_custom_input : true,
    points: typeof codeItem?.max_score === 'number' ? codeItem.max_score : Number(settings.points ?? 100),
    allowed_languages: Array.isArray(body?.languages)
      ? body.languages
      : Array.isArray(settings.allowed_languages)
        ? (settings.allowed_languages as number[])
        : [],
    visible_tests: visibleTests,
    hidden_tests: hiddenTests,
    test_cases: [...visibleTests, ...hiddenTests],
    starter_code: body?.starter_code ?? (settings.starter_code as Record<string, string> | undefined) ?? {},
    solution_code:
      (settings.solution_code as Record<string, string> | undefined) ??
      (typeof settings.reference_solution === 'string' ? { solution: settings.reference_solution } : undefined),
    hints: Array.isArray(settings.hints)
      ? (settings.hints as { id?: string; order?: number; content: string; xp_penalty: number }[])
      : [],
    lifecycle_status: assessment.lifecycle,
    scheduled_at: assessment.scheduled_at ?? null,
    published_at: assessment.published_at ?? null,
    archived_at: assessment.archived_at ?? null,
  };
}

function toCodeItemBody(
  assessment: CodeAssessmentRead,
  codeItem: CodeAssessmentItem | null,
  settings: Partial<CodeChallengeSettings>,
): CodeAssessmentItemBody {
  const existingBody = codeItem?.body;
  const visibleTests = Array.isArray(settings.visible_tests) ? settings.visible_tests : [];
  const hiddenTests = Array.isArray(settings.hidden_tests) ? settings.hidden_tests : [];

  return {
    kind: 'CODE',
    prompt: existingBody?.prompt ?? assessment.description ?? assessment.title,
    languages: settings.allowed_languages ?? existingBody?.languages ?? [],
    starter_code: settings.starter_code ?? existingBody?.starter_code ?? {},
    tests: [
      ...visibleTests.map((test) => toStoredTestCase(test, true)),
      ...hiddenTests.map((test) => toStoredTestCase(test, false)),
    ],
    time_limit_seconds:
      typeof settings.time_limit === 'number' ? settings.time_limit : (existingBody?.time_limit_seconds ?? null),
    memory_limit_mb:
      typeof settings.memory_limit === 'number' ? settings.memory_limit : (existingBody?.memory_limit_mb ?? null),
  };
}

async function upsertCodeItem(assessment: CodeAssessmentRead, settings: Partial<CodeChallengeSettings>) {
  const codeItem = getCodeAssessmentItem(assessment);
  const body = toCodeItemBody(assessment, codeItem, settings);
  const payload = {
    kind: 'CODE',
    title: codeItem?.title ?? assessment.title,
    body,
    max_score: typeof settings.points === 'number' ? settings.points : (codeItem?.max_score ?? 100),
  };

  if (codeItem) {
    const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${codeItem.item_uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to update code challenge item');
    }
    return;
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to create code challenge item');
  }
}

function normalizeJudge0State(
  judge0State: unknown,
  submissionStatus: CanonicalSubmissionStatus,
): CodeSubmission['status'] {
  if (typeof judge0State === 'string' && judge0State.length > 0) {
    return judge0State.toUpperCase() as CodeSubmission['status'];
  }
  if (submissionStatus === 'DRAFT' || submissionStatus === 'PENDING') return 'PENDING';
  return 'COMPLETED';
}

export function mapCanonicalCodeSubmission(raw: GradingSubmission): CodeSubmission {
  const metadata = (raw.metadata_json ?? {}) as CanonicalMetadata;
  const answerMap = (raw.answers_json?.answers ?? {}) as Record<string, CanonicalCodeAnswer>;
  const firstCodeAnswer = Object.values(answerMap).find((answer) => answer?.kind === 'CODE');
  const results = Array.isArray(metadata.latest_run?.details) ? metadata.latest_run.details : undefined;
  return {
    uuid: raw.submission_uuid,
    submission_uuid: raw.submission_uuid,
    submission_status: raw.status,
    status: normalizeJudge0State(metadata.judge0_state, raw.status),
    score: typeof raw.final_score === 'number' ? raw.final_score : (raw.auto_score ?? undefined),
    max_score: 100,
    language_id:
      typeof firstCodeAnswer?.language === 'number'
        ? firstCodeAnswer.language
        : typeof metadata.latest_run?.language_id === 'number'
          ? metadata.latest_run.language_id
          : 0,
    created_at: raw.created_at,
    results,
    test_results: results ? { results } : undefined,
  };
}

export async function getCodeChallengeSettings(activityUuid: string): Promise<CodeChallengeSettings | null> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    return null;
  }
  return toCodeChallengeSettings(assessment, getCodeAssessmentItem(assessment));
}

export async function saveCodeChallengeSettings(
  activityUuid: string,
  settings: Partial<CodeChallengeSettings>,
): Promise<CodeChallengeSettings> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    throw new Error('Code challenge assessment not found');
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
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to save code challenge settings');
  }

  await upsertCodeItem(assessment, settings);

  const refreshed = await loadCodeAssessment(activityUuid);
  if (!refreshed) {
    throw new Error('Failed to reload code challenge settings');
  }
  return toCodeChallengeSettings(refreshed, getCodeAssessmentItem(refreshed));
}

export async function startCodeChallenge(activityUuid: string): Promise<CodeChallengeDraft> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    throw new Error('Code challenge assessment not found');
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/start`, { method: 'POST' });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to start code challenge');
  }

  const submission = (await response.json()) as GradingSubmission;
  return {
    id: submission.id,
    submission_uuid: submission.submission_uuid,
    status: submission.status,
  };
}

export async function submitCode(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<CodeSubmission> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    throw new Error('Code challenge assessment not found');
  }

  const codeItem = getCodeAssessmentItem(assessment);
  if (!codeItem) {
    throw new Error('Code challenge item is not configured');
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
            source: decodeLegacyEditorPayload(sourceCode),
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to submit code');
  }

  return mapCanonicalCodeSubmission((await response.json()) as GradingSubmission);
}

export async function runTests(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<{ results: TestCaseResult[] }> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    throw new Error('Code challenge assessment not found');
  }

  const codeItem = getCodeAssessmentItem(assessment);
  if (!codeItem) {
    throw new Error('Code challenge item is not configured');
  }

  const decodedSource = decodeLegacyEditorPayload(sourceCode);
  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${codeItem.item_uuid}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: languageId,
      source: decodedSource,
      idempotency_key: codeRunIdempotencyKey(assessment.assessment_uuid, codeItem.item_uuid, languageId, decodedSource),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail?.message || error.detail || 'Failed to run code challenge tests');
  }

  const run = (await response.json()) as CanonicalCodeRunResponse;
  if (run.status === 'DEGRADED') {
    throw new Error(run.error_message || 'Code runner is temporarily unavailable');
  }

  return {
    results: run.visible_results.map((result, index) => toTestCaseResult(result, index, run)),
  };
}

export async function runCustomTest(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
  stdin: string,
): Promise<{
  stdout?: string;
  stderr?: string;
  compile_output?: string;
  status: number;
  status_description: string;
  time_ms?: number;
  memory_kb?: number;
}> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    throw new Error('Code challenge assessment not found');
  }

  const codeItem = getCodeAssessmentItem(assessment);
  if (!codeItem) {
    throw new Error('Code challenge item is not configured');
  }

  const decodedSource = decodeLegacyEditorPayload(sourceCode);
  const decodedStdin = decodeLegacyEditorPayload(stdin);
  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${codeItem.item_uuid}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: languageId,
      source: decodedSource,
      custom_input: decodedStdin,
      idempotency_key: codeRunIdempotencyKey(
        assessment.assessment_uuid,
        codeItem.item_uuid,
        languageId,
        decodedSource,
        decodedStdin,
      ),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail?.message || error.detail || 'Failed to run custom test');
  }

  const run = (await response.json()) as CanonicalCodeRunResponse;
  if (run.status === 'DEGRADED') {
    throw new Error(run.error_message || 'Code runner is temporarily unavailable');
  }

  return {
    stdout: run.stdout ?? undefined,
    stderr: run.stderr ?? undefined,
    compile_output: run.compile_output ?? undefined,
    status: runStatusCode(run.status, run.passed, run.total),
    status_description: run.status,
    time_ms: typeof run.time === 'number' ? Math.round(run.time * 1000) : undefined,
    memory_kb: typeof run.memory === 'number' ? run.memory : undefined,
  };
}

export async function getSubmission(submissionUuid: string): Promise<CodeSubmission> {
  const response = await apiFetch(`grading/submissions/me/${submissionUuid}`);

  if (!response.ok) {
    throw new Error('Failed to fetch submission');
  }

  return mapCanonicalCodeSubmission((await response.json()) as GradingSubmission);
}

export async function getSubmissions(activityUuid: string): Promise<CodeSubmission[]> {
  const assessment = await loadCodeAssessment(activityUuid);
  if (!assessment) {
    return [];
  }

  const response = await apiFetch(`assessments/${assessment.assessment_uuid}/me`);

  if (!response.ok) {
    throw new Error('Failed to fetch submissions');
  }

  return ((await response.json()) as CanonicalSubmissionRead[] as unknown as GradingSubmission[]).map(
    mapCanonicalCodeSubmission,
  );
}

interface CanonicalCodeRunTestResult {
  test_id: string;
  passed: boolean;
  stdin?: string | null;
  expected?: string | null;
  actual?: string | null;
  time?: number | null;
  memory?: number | null;
}

interface CanonicalCodeRunResponse {
  status: string;
  passed: number;
  total: number;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  time?: number | null;
  memory?: number | null;
  visible_results: CanonicalCodeRunTestResult[];
  error_message?: string | null;
}

function toTestCaseResult(
  result: CanonicalCodeRunTestResult,
  index: number,
  run: CanonicalCodeRunResponse,
): TestCaseResult {
  return {
    test_case_id: result.test_id || `visible_${index + 1}`,
    status: result.passed ? 3 : runStatusCode(run.status, run.passed, run.total),
    status_description: result.passed ? 'Accepted' : run.status,
    passed: result.passed,
    time_ms: typeof result.time === 'number' ? Math.round(result.time * 1000) : null,
    memory_kb: typeof result.memory === 'number' ? result.memory : null,
    stdout: result.actual ?? run.stdout ?? null,
    stderr: run.stderr ?? null,
    compile_output: run.compile_output ?? null,
  };
}

function runStatusCode(status: string, passed: number, total: number) {
  const normalized = status.toUpperCase();
  if (normalized.includes('COMPILE')) return 6;
  if (normalized.includes('TIMEOUT')) return 5;
  if (normalized.includes('RUNTIME')) return 11;
  if (total > 0 && passed < total) return 4;
  return 3;
}
