import { renderToString } from 'react-dom/server'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { SheetPanel } from '../sheet-panel'
import { ConfirmDialog } from './confirm-dialog'
import { FormDialog } from './form-dialog'

const noop = () => {}
const trigger = <Button>{m.ui_save()}</Button>
const title = m.ui_save()

// A click React replays mid-hydration opens nothing: on an SSR page every dialog trigger waits (AGENTS.md).
test('dialog, confirm and sheet triggers render disabled and marked data-hydrating until hydration', () => {
  const html = [
    renderToString(
      <FormDialog
        open={false}
        onOpenChange={noop}
        trigger={trigger}
        title={title}
        submitLabel={title}
        onSubmit={async () => {}}
        pending={false}
        error={null}
      >
        {null}
      </FormDialog>,
    ),
    renderToString(
      <ConfirmDialog
        open={false}
        onOpenChange={noop}
        trigger={trigger}
        title={title}
        consequence={title}
        confirmLabel={title}
        pending={false}
        error={null}
      />,
    ),
    renderToString(
      <SheetPanel trigger={trigger} title={title} side="right">
        {null}
      </SheetPanel>,
    ),
  ]
  for (const markup of html) expect(markup).toMatch(/<button[^>]*disabled=""[^>]*data-hydrating="true"/)
})
