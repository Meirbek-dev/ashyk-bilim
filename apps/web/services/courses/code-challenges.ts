import { apiFetch } from '@/lib/api-client';

const CODE_CHALLENGE_API_BASE = 'assessments/code-challenges';

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
}

export interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  points?: number;
}

export interface CodeSubmission {
  uuid: string;
  submission_uuid?: string;
  submission_status?: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED' | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PENDING_JUDGE0' | 'pending' | 'processing' | 'completed' | 'failed' | 'error';
  score?: number;
  max_score?: number;
  language_id: number;
  created_at: string;
  results?: TestCaseResult[];
  test_results?: { results?: TestCaseResult[] };
}

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

export async function getLanguages(): Promise<Judge0Language[]> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/languages`, { cache: 'force-cache' });

  if (!response.ok) {
    throw new Error('Failed to fetch languages');
  }

  return response.json();
}

export async function getCodeChallengeSettings(activityUuid: string): Promise<CodeChallengeSettings | null> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/settings`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to fetch code challenge settings');
  }

  return response.json();
}

export async function saveCodeChallengeSettings(
  activityUuid: string,
  settings: Partial<CodeChallengeSettings>,
): Promise<CodeChallengeSettings> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to save code challenge settings');
  }

  return response.json();
}

export async function startCodeChallenge(activityUuid: string): Promise<CodeChallengeDraft> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/start`, { method: 'POST' });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to start code challenge');
  }

  return response.json();
}

export async function submitCode(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<CodeSubmission> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: sourceCode, language_id: languageId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to submit code');
  }

  return response.json();
}

export async function runTests(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<{ results: TestCaseResult[] }> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: sourceCode, language_id: languageId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to run tests');
  }

  return response.json();
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
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/custom-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: sourceCode, language_id: languageId, stdin }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to run custom test');
  }

  return response.json();
}

export async function getSubmission(submissionUuid: string): Promise<CodeSubmission> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/submissions/${submissionUuid}`);

  if (!response.ok) {
    throw new Error('Failed to fetch submission');
  }

  return response.json();
}

export async function getSubmissions(activityUuid: string): Promise<CodeSubmission[]> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/submissions`);

  if (!response.ok) {
    throw new Error('Failed to fetch submissions');
  }

  return response.json();
}

export async function getLeaderboard(
  activityUuid: string,
  limit = 50,
): Promise<
  {
    rank: number;
    user_id: number;
    username: string;
    best_score: number;
    best_time_ms: number;
    submission_count: number;
    first_solved_at: string;
  }[]
> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/leaderboard?limit=${limit}`);

  if (!response.ok) {
    throw new Error('Failed to fetch leaderboard');
  }

  return response.json();
}

export async function getAnalytics(activityUuid: string): Promise<{
  total_submissions: number;
  unique_users: number;
  success_rate: number;
  avg_score: number;
  avg_attempts: number;
  language_distribution: Record<string, number>;
  score_distribution: Record<string, number>;
}> {
  const response = await apiFetch(`${CODE_CHALLENGE_API_BASE}/${activityUuid}/analytics`);

  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }

  return response.json();
}
