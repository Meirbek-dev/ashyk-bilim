// Guards the ActivityAIPanel + dock-spacing pairing invariant: any route/host that
// renders the floating AI panel must go through `ActivityAIDockLayout`, which applies
// the matching content-spacing style by construction. A host that imports
// `ActivityAIPanel` directly can render the panel without ever reserving space for it,
// which silently regresses back to "the AI panel covers the page content" — the exact
// bug plans/ai-chat-ux-roast-and-tanstack-ai-plan.md was written to permanently kill.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const ignored = new Set(['.git', '.next', '.turbo', '.vercel', 'coverage', 'dist', 'node_modules', 'test-results'])

// The only files allowed to reference ActivityAIPanel directly.
const allowList = new Set([
  join(root, 'src/features/ai-experience/activity-panel/activity-ai-dock-layout.tsx'),
  join(root, 'src/features/ai-experience/activity-panel/activity-ai-panel.tsx'),
])

const violations = []

scan(join(root, 'src'))

if (violations.length > 0) {
  console.error('ActivityAIPanel must only be rendered through ActivityAIDockLayout:')
  for (const file of violations) {
    console.error(`- ${relative(root, file)}`)
  }
  console.error('\nImport ActivityAIDockLayout from "@/features/ai-experience" instead of ActivityAIPanel directly.')
  process.exit(1)
}

function scan(directory) {
  let entries
  try {
    entries = readdirSync(directory)
  } catch {
    return
  }

  for (const entry of entries) {
    if (ignored.has(entry)) continue
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      scan(fullPath)
      continue
    }
    if (!/\.(tsx|ts)$/.test(entry)) continue
    if (allowList.has(fullPath)) continue

    const content = readFileSync(fullPath, 'utf8')
    if (/\bActivityAIPanel\b/.test(content)) {
      violations.push(fullPath)
    }
  }
}
