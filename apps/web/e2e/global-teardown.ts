/**
 * Global teardown — runs once after the entire test suite.
 *
 * We intentionally keep teardown minimal: test data (courses, submissions)
 * created during the suite is useful to inspect after failures.
 * We only clean up the auth state directory so stale tokens don't linger.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORAGE_STATE_DIR } from './auth-states'

const _dirname = path.dirname(fileURLToPath(import.meta.url)) // ESM compat

export default async function globalTeardown(): Promise<void> {
  // Remove saved authentication states (they contain session tokens)
  for (const file of fs.readdirSync(STORAGE_STATE_DIR)) {
    fs.unlinkSync(path.join(STORAGE_STATE_DIR, file))
  }
  console.log('[teardown] Cleared auth storage states.')
}
