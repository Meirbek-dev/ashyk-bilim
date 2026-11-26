import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/shared/ui/alert-dialog'
import { Button } from '#/shared/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '#/shared/ui/dialog'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '#/shared/ui/sheet'

const text = { open: 'Open', title: 'Details', inner: 'Inner', more: 'More', pick: 'Pick', nested: 'Nested' }

/** A dialog with a popover and a second dialog inside it. */
function Layers({ onPick }: { onPick: () => void }) {
  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>{text.title}</DialogTitle>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>{text.more}</PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>{text.more}</PopoverTitle>
            <Button onClick={onPick}>{text.pick}</Button>
          </PopoverContent>
        </Popover>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>{text.nested}</DialogTrigger>
          <DialogContent>
            <DialogTitle>{text.inner}</DialogTitle>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  test('Escape closes it and focus returns to the trigger; the corner button closes it too', async () => {
    await renderInRouter(
      <Dialog>
        <DialogTrigger render={<Button />}>{text.open}</DialogTrigger>
        <DialogContent>
          <DialogTitle>{text.title}</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const trigger = page.getByRole('button', { name: text.open })
    const dialog = page.getByRole('dialog', { name: text.title })
    await trigger.click()
    await expect.element(dialog).toBeVisible()
    await expect.element(dialog.getByRole('button', { name: m.ui_close() })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()

    await trigger.click()
    await dialog.getByRole('button', { name: m.ui_close() }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })

  test('renders under the body, not under the styles around its trigger', async () => {
    await renderInRouter(
      <div className="text-xs whitespace-nowrap uppercase">
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>{text.title}</DialogTitle>
          </DialogContent>
        </Dialog>
      </div>,
    )
    const dialog = page.getByRole('dialog', { name: text.title })
    await expect.element(dialog).toBeVisible()
    const content = dialog.element()
    expect(content.parentElement).toBe(document.body)
    expect(getComputedStyle(content).whiteSpace).toBe('normal')
    expect(getComputedStyle(content).textTransform).toBe('none')
  })

  test('a popup opened inside stays usable, and Escape closes the topmost layer first', async () => {
    const picked = vi.fn<() => void>()
    await renderInRouter(<Layers onPick={picked} />)
    const dialog = page.getByRole('dialog', { name: text.title })
    await dialog.getByRole('button', { name: text.more }).click()
    await page.getByRole('button', { name: text.pick }).click()
    expect(picked).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('button', { name: text.pick })).not.toBeInTheDocument()
    await expect.element(dialog).toBeVisible()

    await dialog.getByRole('button', { name: text.nested }).click()
    const inner = page.getByRole('dialog', { name: text.inner })
    await expect.element(inner).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(inner).not.toBeInTheDocument()
    await expect.element(dialog).toBeVisible()
    await expect.element(dialog.getByRole('button', { name: text.nested })).toHaveFocus()
  })
})

function Confirm({ onOpenChange }: { onOpenChange: (open: boolean, returnValue: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next)
        onOpenChange(next, details.returnValue)
      }}
    >
      <AlertDialogTrigger render={<Button />}>{text.open}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{text.title}</AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.ui_cancel()}</AlertDialogCancel>
          <AlertDialogAction>{m.ui_save()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe('AlertDialog', () => {
  test('starts on Cancel, ignores a press outside, and the action answers "confirm"', async () => {
    const onOpenChange = vi.fn<(open: boolean, returnValue: string | undefined) => void>()
    await renderInRouter(<Confirm onOpenChange={onOpenChange} />)
    await page.getByRole('button', { name: text.open }).click()
    const dialog = page.getByRole('alertdialog', { name: text.title })
    await expect.element(dialog.getByRole('button', { name: m.ui_cancel() })).toHaveFocus()
    await userEvent.click(document.body, { position: { x: 4, y: 4 } })
    await expect.element(dialog).toBeVisible()
    await dialog.getByRole('button', { name: m.ui_save() }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'confirm')
    await expect.element(page.getByRole('button', { name: text.open })).toHaveFocus()
  })
})

describe('Sheet', () => {
  test('slides from the side it is given; Escape closes it and focus returns to the trigger', async () => {
    await page.viewport(1280, 800)
    await renderInRouter(
      <Sheet side="left">
        <SheetTrigger render={<Button />}>{text.open}</SheetTrigger>
        <SheetContent>
          <SheetTitle>{text.title}</SheetTitle>
        </SheetContent>
      </Sheet>,
    )
    const trigger = page.getByRole('button', { name: text.open })
    await trigger.click()
    const sheet = page.getByRole('dialog', { name: text.title })
    await expect.element(sheet).toBeVisible()
    await expect.element(sheet).toHaveAttribute('data-side', 'left')
    await expect.poll(() => sheet.element().getBoundingClientRect().left).toBe(0)
    await userEvent.keyboard('{Escape}')
    await expect.element(sheet).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })
})
