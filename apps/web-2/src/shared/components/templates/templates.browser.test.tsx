import { page } from 'vite-plus/test/browser'
import { describe, expect, test, vi } from 'vite-plus/test'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { Button } from '#/shared/ui/button'
import { buttonVariants } from '../button-variants'

import { renderInRouter } from '../testing'
import { DetailPage } from './detail-page'
import { FocusPage } from './focus-page'
import { ListPage } from './list-page'
import { revealCurrentTab, SettingsPage } from './settings-page'
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
        <RouterLink to="/" className={buttonVariants({ variant: 'ghost' })}>
          {text.back}
        </RouterLink>
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
        status={<StatusBadge tone="warning">{text.draft}</StatusBadge>}
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

  test('a long contents panel opens scrolled to the current item; the page does not move', async () => {
    await page.viewport(1440, 600)
    const rows = Array.from({ length: 40 }, (_, index) => index)
    const screen = await renderInRouter(
      <FocusPage
        back={null}
        title={text.activity}
        contents={
          <ol>
            {rows.map(index => (
              <li key={index} aria-current={index === 38 ? 'page' : undefined} className="h-10">
                {`${text.activity} ${index}`}
              </li>
            ))}
          </ol>
        }
      >
        {null}
      </FocusPage>,
    )
    const current = screen.getByText(`${text.activity} 38`)
    await expect.element(current).toBeInViewport()
    expect(window.scrollY).toBe(0)
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

describe('revealCurrentTab', () => {
  test('a sideways-scrolling tab row shows its current tab, cut off at the edge otherwise', async () => {
    const screen = await renderInRouter(
      <nav ref={revealCurrentTab} aria-label={text.title} className="relative flex w-40 overflow-x-auto">
        {['Profile', 'Security', 'Appearance', 'Notifications'].map((name, index) => (
          <span key={name} aria-current={index === 3 ? 'page' : undefined} className="shrink-0 px-4">
            {name}
          </span>
        ))}
      </nav>,
    )
    const row = screen.getByRole('navigation', { name: text.title })
    await expect.element(row).toBeVisible()
    const nav = row.element()
    const current = screen.getByText('Notifications').element()
    expect(nav.scrollLeft).toBeGreaterThan(0)
    expect(current.getBoundingClientRect().right).toBeLessThanOrEqual(nav.getBoundingClientRect().right + 1)
  })
})
