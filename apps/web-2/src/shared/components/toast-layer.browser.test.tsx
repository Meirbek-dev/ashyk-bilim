import { describe, expect, test } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { Toaster, toast } from '#/shared/ui/toast'

import { SheetPanel } from './sheet-panel'
import { renderInRouter } from './testing'

const sheetTitle = 'Айгерим'
const sheetBody = 'Начислить XP'

// The modal sheet hides the rest of the page from the accessibility tree: the toast is looked up in the DOM.
const toastNamed = (title: string) =>
  [...document.querySelectorAll('[data-slot="toast"]')].find(el => el.textContent.includes(title))

/** Whether the toast's centre is the toast itself, not whatever covers it. */
const onTop = (title: string) => {
  const box = toastNamed(title)?.getBoundingClientRect()
  if (!box || box.height === 0) return false
  const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return top?.closest('[data-slot="toast"]') != null
}

describe('toast layer', () => {
  test('a toast from an action inside a sheet draws above the sheet, not behind it', async () => {
    await page.viewport(1440, 900)
    // As in the app: the Toaster is mounted (root document) before any sheet opens and portals after it.
    await renderInRouter(<Toaster />)
    toast.add({ title: 'Открыто' })
    await expect.poll(() => document.querySelector('[data-slot="toast-viewport"]')).not.toBeNull()
    await renderInRouter(
      <SheetPanel open side="right" title={sheetTitle}>
        <p>{sheetBody}</p>
      </SheetPanel>,
    )
    await expect.poll(() => document.querySelector('[role="dialog"]:not([data-slot="toast"])')).not.toBeNull()
    toast.add({ title: 'Начислено' })
    await expect.poll(() => onTop('Начислено')).toBe(true)
  })
})
