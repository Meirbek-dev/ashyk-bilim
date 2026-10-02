import { page } from 'vite-plus/test/browser'
import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { Badge } from '../badge'
import { Button } from '../button'
import { Link } from '../link'
import { renderInRouter } from '../testing'
import { DetailPage } from './detail-page'
import { FocusPage } from './focus-page'
import { ListPage } from './list-page'
import { SettingsPage } from './settings-page'
import { SettingsSection } from './settings-section'

const text = {
  title: 'Courses',
  create: 'New course',
  export: 'Export',
  filter: 'Only mine',
  overview: 'Overview',
  draft: 'Draft',
  back: 'Back',
  activity: 'Fractions',
  rubric: 'Rubric',
  profile: 'Profile',
  section: 'Name',
  hint: 'Shown on your profile.',
}

const renderList = () =>
  renderInRouter(
    <ListPage
      title={text.title}
      primaryAction={<Button>{text.create}</Button>}
      secondaryActions={[{ label: text.export, onSelect: () => undefined }]}
      filters={<Button variant="outline">{text.filter}</Button>}
      activeFilters={2}
    >
      {null}
    </ListPage>,
  )

const renderFocus = () =>
  renderInRouter(
    <FocusPage
      back={
        <Link to="/" variant="ghost">
          {text.back}
        </Link>
      }
      title={text.activity}
      contents={<p>{text.overview}</p>}
      aside={{ label: text.rubric, content: <p>{text.draft}</p> }}
    >
      {null}
    </FocusPage>,
  )

describe('ListPage', () => {
  test('wide: actions and filters inline', async () => {
    await page.viewport(1280, 800)
    const screen = await renderList()
    await expect.element(screen.getByRole('heading', { level: 1, name: text.title })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: text.export })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: text.filter })).toBeVisible()
  })

  test('narrow: the primary action stays, the rest go to a menu and a "Filters (n)" sheet', async () => {
    await page.viewport(390, 800)
    const screen = await renderList()
    await expect.element(screen.getByRole('button', { name: text.create })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: text.export })).not.toBeInTheDocument()
    await screen.getByRole('button', { name: m.ui_more_actions() }).click()
    await expect.element(page.getByRole('menuitem', { name: text.export })).toBeVisible()
    await page.getByRole('menuitem', { name: text.export }).click()
    await screen.getByRole('button', { name: m.ui_filters_count({ count: 2 }) }).click()
    const sheet = page.getByRole('dialog', { name: m.ui_filters() })
    await expect.element(sheet.getByRole('button', { name: text.filter })).toBeVisible()
  })
})

describe('DetailPage', () => {
  test('title, status, primary action and tabs that are route links', async () => {
    await page.viewport(390, 800)
    const screen = await renderInRouter(
      <DetailPage
        title={text.title}
        status={<Badge tone="warning">{text.draft}</Badge>}
        primaryAction={<Button>{text.create}</Button>}
        tabs={
          <Link to="/" variant="tab">
            {text.overview}
          </Link>
        }
      >
        {null}
      </DetailPage>,
    )
    await expect.element(screen.getByRole('heading', { level: 1, name: text.title })).toBeVisible()
    await expect.element(screen.getByText(text.draft)).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: m.ui_sections() })
    await expect.element(tabs.getByRole('link', { name: text.overview })).toHaveAttribute('aria-current', 'page')
  })
})

describe('FocusPage', () => {
  test('wide: both panels beside the main column', async () => {
    await page.viewport(1440, 900)
    const screen = await renderFocus()
    await expect.element(screen.getByRole('navigation', { name: m.ui_contents() })).toBeVisible()
    await expect.element(screen.getByRole('complementary', { name: text.rubric })).toBeVisible()
  })

  test('narrow: the panels open as sheets from the top bar', async () => {
    await page.viewport(390, 800)
    const screen = await renderFocus()
    await expect.element(screen.getByRole('navigation', { name: m.ui_contents() })).not.toBeInTheDocument()
    await screen.getByRole('button', { name: text.rubric }).click()
    await expect.element(page.getByRole('dialog', { name: text.rubric }).getByText(text.draft)).toBeVisible()
  })
})

describe('SettingsPage', () => {
  test('each section is its own form with its own Save', async () => {
    await page.viewport(1280, 800)
    const onSubmit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const screen = await renderInRouter(
      <SettingsPage
        title={text.title}
        nav={
          <Link to="/" variant="tab">
            {text.profile}
          </Link>
        }
      >
        <SettingsSection title={text.section} description={text.hint} onSubmit={onSubmit} pending={false} error={null}>
          {null}
        </SettingsSection>
      </SettingsPage>,
    )
    const section = screen.getByRole('form', { name: text.section })
    await expect.element(section.getByRole('heading', { level: 2, name: text.section })).toBeVisible()
    await section.getByRole('button', { name: m.ui_save() }).click()
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
