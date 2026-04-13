import { apiFetch } from '@/lib/api-client';

export interface CodeChallengeSettings {
  uuid: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  max_submissions?: number;
  grading_strategy: 'all_or_nothing' | 'partial' | 'weighted';
  allowed_languages: number[];
  test_cases: TestCase[];
  starter_code?: Record<string, string>;
  solution_code?: Record<string, string>;
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
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'error';
  score?: number;
  max_score: number;
  language_id: number;
  created_at: string;
  results?: TestCaseResult[];
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
  const response = await apiFetch('code-challenges/languages', { cache: 'force-cache' });

  if (!response.ok) {
    throw new Error('Failed to fetch languages');
  }

  return response.json();
}

export async function getCodeChallengeSettings(activityUuid: string): Promise<CodeChallengeSettings | null> {
  const response = await apiFetch(`code-challenges/${activityUuid}/settings`);

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
  const response = await apiFetch(`code-challenges/${activityUuid}/settings`, {
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

export async function submitCode(
  activityUuid: string,
  sourceCode: string,
  languageId: number,
): Promise<CodeSubmission> {
  const response = await apiFetch(`code-challenges/${activityUuid}/submit`, {
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
  const response = await apiFetch(`code-challenges/${activityUuid}/test`, {
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
  const response = await apiFetch(`code-challenges/${activityUuid}/custom-test`, {
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
  const response = await apiFetch(`code-challenges/submissions/${submissionUuid}`);

  if (!response.ok) {
    throw new Error('Failed to fetch submission');
  }

  return response.json();
}

export async function getSubmissions(activityUuid: string): Promise<CodeSubmission[]> {
  const response = await apiFetch(`code-challenges/${activityUuid}/submissions`);

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
  const response = await apiFetch(`code-challenges/${activityUuid}/leaderboard?limit=${limit}`);

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
  const response = await apiFetch(`code-challenges/${activityUuid}/analytics`);

  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }

  return response.json();
}
