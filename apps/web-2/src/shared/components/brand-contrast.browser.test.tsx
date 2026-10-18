import axe from 'axe-core'
import { afterEach, expect, test } from 'vite-plus/test'

import { Button } from '#/shared/ui/button'

import { renderInRouter } from './testing'

const text = { action: 'Continue', selected: 'Selected', link: 'Action link' }

afterEach(() => delete document.documentElement.dataset['mode'])

test.for(['light', 'dark'])('default brand actions have readable contrast in %s mode', async mode => {
  document.documentElement.dataset['mode'] = mode
  const view = await renderInRouter(
    <div className="flex flex-col gap-4 bg-background p-6">
      <Button>{text.action}</Button>
      <span className="bg-sidebar-primary p-2 text-sidebar-primary-foreground">{text.selected}</span>
      <span className="text-primary">{text.link}</span>
    </div>,
  )
  await expect.element(view.getByRole('button')).toBeVisible()
  const result = await axe.run(document.body, { runOnly: ['color-contrast'] })
  expect(result.violations.map(violation => violation.nodes)).toEqual([])
})
