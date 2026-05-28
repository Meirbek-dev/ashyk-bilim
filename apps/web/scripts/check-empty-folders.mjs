import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const ignored = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

const scanRoots = ['src', 'scripts'].map(entry => join(root, entry))
const emptyFolders = []
const baselineEmptyFolders = new Set([
  'src/components/Activities',
  'src/components/Contexts/Assignments',
  'src/components/Dashboard/Pages/Course/CurriculumPanel',
  'src/components/Dashboard/Pages/Metrics/MetricsGeneral',
  'src/components/Dashboard/Pages/OrgAccess',
  'src/components/features/auth',
  'src/components/features/dashboard',
  'src/components/features/editor',
  'src/components/features/organizations',
  'src/components/kibo-ui/qr-code',
  'src/components/Objects/Activities/Assignment',
  'src/components/Objects/Activities/CodeChallenge',
  'src/components/Objects/Courses/CourseUpdates',
  'src/components/Objects/Elements/ConfirmationModal',
  'src/components/Objects/Elements/Info',
  'src/components/Objects/Grids',
  'src/components/Objects/Modals/Activities/Assignments',
  'src/components/Objects/Modals/Chapters',
  'src/components/Objects/Onboarding',
  'src/components/Objects/Quiz',
  'src/components/Security/__tests__',
  'src/components/svg',
  'src/components/Utils/libs',
  'src/services/blocks/Quiz',
  'src/services/utils/react/middlewares',
])

for (const directory of scanRoots) {
  scan(directory)
}

const newEmptyFolders = emptyFolders.filter(
  folder => !baselineEmptyFolders.has(toPortablePath(relative(root, folder))),
)

if (newEmptyFolders.length > 0) {
  console.error('Empty folders are not allowed:')
  for (const folder of newEmptyFolders) {
    console.error(`- ${relative(root, folder)}`)
  }
  process.exit(1)
}

function scan(directory) {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  const visibleEntries = entries.filter(entry => !ignored.has(entry.name))
  if (visibleEntries.length === 0) {
    emptyFolders.push(directory)
    return
  }

  for (const entry of visibleEntries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      scan(path)
    } else if (entry.isSymbolicLink()) {
      const stats = statSync(path)
      if (stats.isDirectory()) scan(path)
    }
  }
}

function toPortablePath(path) {
  return path.replaceAll('\\', '/')
}
