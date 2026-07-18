import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const srcRoot = join(root, 'src')

const ignoredDirs = new Set(['.next', 'coverage', 'dist', 'node_modules'])
const allowedDirectFetch = [
  'src/lib/api-client.ts',
  'src/lib/auth/server-auth-fetch.ts',
  'src/lib/cache/revalidate.ts',
  'src/app/api/',
  'src/tests/',
  'src/e2e/',
]
const allowedConsole = [
  'src/app/api/log-error/route.ts',
  'src/app/global-error.tsx',
  'src/app/error.tsx',
  'src/app/[locale]/error.tsx',
  'src/components/providers/browser-error-reporter.tsx',
]

const findings = []

scan(srcRoot)

const counts = findings.reduce((acc, finding) => {
  acc[finding.code] = (acc[finding.code] ?? 0) + 1
  return acc
}, {})

console.log('Frontend error handling audit')
for (const [code, count] of Object.entries(counts).sort()) {
  console.log(`- ${code}: ${count}`)
}

if (findings.length > 0) {
  console.log('\nFirst findings:')
  for (const finding of findings.slice(0, 100)) {
    console.log(`- ${finding.path}:${finding.line}: ${finding.code} ${finding.message}`)
  }
}

if (findings.some(finding => finding.code === 'QUERY_FALLBACK_WITHOUT_ERROR_UI')) {
  process.exitCode = 1
}

function scan(directory) {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      scan(path)
      continue
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue
    inspectFile(path)
  }
}

function inspectFile(path) {
  const rel = toPortablePath(relative(root, path))
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (/\breadJsonOrThrow\b/.test(line)) {
      add(rel, lineNumber, 'LOCAL_RESPONSE_PARSER', 'use apiJson/apiResult/parseApiError')
    }
    if (/\bfetch\s*\(/.test(line) && !isAllowed(rel, allowedDirectFetch)) {
      add(rel, lineNumber, 'DIRECT_FETCH', 'use apiJson/apiResult/apiBody unless this is an external non-API fetch')
    }
    if (/throw new Error\(/.test(line) && rel.includes('/services/')) {
      add(rel, lineNumber, 'PLAIN_SERVICE_ERROR', 'throw APIError or a typed domain/client error in service code')
    }
    if (/console\.(error|warn)\s*\(/.test(line) && !isAllowed(rel, allowedConsole)) {
      add(rel, lineNumber, 'CONSOLE_ERROR', 'route through telemetry or a documented boundary logger')
    }
    if (/\.(data)\b.*\?\?\s*(\[\]|\{\})/.test(line) && /\.(tsx|jsx)$/.test(rel) && !hasNearbyErrorCheck(lines, index)) {
      add(
        rel,
        lineNumber,
        'QUERY_FALLBACK_WITHOUT_ERROR_UI',
        'check query.isError/query.error before rendering fallback data',
      )
    }
  })
}

function add(path, line, code, message) {
  findings.push({ path, line, code, message })
}

function isAllowed(path, prefixes) {
  return prefixes.some(prefix => path === prefix || path.startsWith(prefix))
}

function hasNearbyErrorCheck(lines, index) {
  const start = Math.max(0, index - 40)
  const end = Math.min(lines.length, index + 80)
  const nearby = lines.slice(start, end).join('\n')
  return /\b(isError|error)\b/.test(nearby) && /\b(ErrorState|InlineError|toastApiError|handleApiError)\b/.test(nearby)
}

function toPortablePath(path) {
  return path.replaceAll('\\', '/')
}
