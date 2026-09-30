// UX-296 (UX-052/UX-081 class): the shells own the one <main> landmark (SidebarInset in the
// dash, MainShell under the menu); feature views are regions inside it, never another <main>.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const SRC = join(__dirname, '..', '..')
const OWNERS = new Set(['components/ui/sidebar.tsx'])

function tsxFiles(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return tsxFiles(rel)
    return entry.name.endsWith('.tsx') ? [rel] : []
  })
}

describe('main landmark', () => {
  it('no feature or shared view renders its own <main>', () => {
    const offenders = ['features', 'components', 'app/_shared']
      .flatMap(tsxFiles)
      .filter(file => !OWNERS.has(file) && /^\s*<main\b/mu.test(readFileSync(join(SRC, file), 'utf8')))
    expect(offenders).toEqual([])
  })
})
