/**
 * Environment probes — infrastructure preconditions the stack may lack.
 *
 * Judge0 backs the code arena: without it `GET code/languages` answers 503 and
 * a code challenge can be neither authored (languages tab) nor attempted. The
 * probe runs once in global setup and lands in `E2E_JUDGE0`; the code-challenge
 * tests read it through `judge0Missing()` and skip with a reason instead of
 * failing on a missing service.
 */

import { getEnv } from '../env'

export const JUDGE0_SKIP_REASON = 'Judge0 not reachable (code/languages 503) — code arena needs the executor'

/** True when the executor answered `GET code/languages` with 2xx. */
export async function probeJudge0(apiUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/code/languages`)
    return res.ok
  } catch {
    return false
  }
}

/** Skip condition for the code-challenge tests (set by global setup via `setEnv('E2E_JUDGE0', …)`). */
export const judge0Missing = (): boolean => getEnv('E2E_JUDGE0') !== 'true'
