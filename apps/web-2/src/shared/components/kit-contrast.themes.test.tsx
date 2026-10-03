// G-15 (phase gate, not in `vp test run`): the reference set of the stock kit and our composites passes axe
// color-contrast in every theme and both modes. Run: `bun run g15`. A failure names the theme, the mode and the element.
import axe from 'axe-core'
import { describe, expect, test } from 'vite-plus/test'

import { loadThemeManifest } from '#/shared/api/themes'
import { themeHref } from '#/shared/lib/appearance'
import { Button } from '#/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/shared/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'

import { DataTable } from './data-table'
import { ErrorAlert } from './error-alert'
import { Link } from './link'
import { ListState } from './list-state'
import { StatusBadge } from './status-badge'
import { DetailPage } from './templates/detail-page'
import { renderInRouter } from './testing'

const text = { title: 'Algebra', meta: 'Updated today', line: 'Body text', action: 'Save', tab: 'Overview' }
const rows = [{ id: 'a', name: 'Algebra', learners: 12 }]
const columns = [
  { id: 'name', header: 'Name', cell: (row: (typeof rows)[number]) => row.name, priority: 1 as const },
  { id: 'learners', header: 'Learners', cell: (row: (typeof rows)[number]) => row.learners, priority: 2 as const },
]
const tones = ['neutral', 'success', 'warning', 'info', 'destructive'] as const
const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive'] as const

/** The stock shadcn primitives and our composites as features use them. */
function ReferenceSet() {
  return (
    <DetailPage
      title={text.title}
      meta={text.meta}
      status={tones.map(tone => (
        <StatusBadge key={tone} tone={tone}>
          {tone}
        </StatusBadge>
      ))}
      primaryAction={<Button>{text.action}</Button>}
      tabs={
        <Link to="/" variant="tab">
          {text.tab}
        </Link>
      }
    >
      <p>{text.line}</p>
      <Link to="/">{text.tab}</Link>
      {variants.map(variant => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
      <Field>
        <FieldLabel htmlFor="g15-input">{text.title}</FieldLabel>
        <Input id="g15-input" placeholder={text.meta} />
        <FieldDescription>{text.line}</FieldDescription>
      </Field>
      <ErrorAlert>{text.line}</ErrorAlert>
      <DataTable label={text.title} rows={rows} columns={columns} getKey={row => row.id} />
      <ListState pending={false} error={null} count={0} filtered emptyText={text.line} onRetry={() => undefined}>
        {null}
      </ListState>
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.meta}</DialogDescription>
          </DialogHeader>
          <p>{text.line}</p>
          <DialogFooter>
            <Button variant="ghost">{text.action}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPage>
  )
}

const themes = await loadThemeManifest()

const applyTheme = async (slug: string) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: themeHref(slug) })
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener('load', resolve)
    link.addEventListener('error', reject)
  })
  document.head.append(link)
  await loaded
  document.documentElement.dataset['theme'] = slug
  return () => link.remove()
}

// Colors must be read at rest, not halfway through a transition.
const still = Object.assign(document.createElement('style'), { textContent: '*{transition:none!important}' })
document.head.append(still)

describe('G-15 kit contrast', () => {
  test('the manifest lists all 63 themes', () => {
    expect(themes).toHaveLength(63)
  })

  test.for(themes)('$slug', { timeout: 30_000 }, async ({ slug }) => {
    const removeTheme = await applyTheme(slug)
    await renderInRouter(<ReferenceSet />)
    const failures: string[] = []
    for (const mode of ['light', 'dark']) {
      document.documentElement.dataset['mode'] = mode
      const result = await axe.run(document.body, { runOnly: ['color-contrast'] })
      for (const violation of result.violations)
        for (const node of violation.nodes)
          failures.push(`${mode} ${node.target.join(' ')}: ${node.any[0]?.message ?? ''}`)
    }
    removeTheme()
    expect(failures).toEqual([])
  })
})
