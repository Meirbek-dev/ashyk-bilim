import { useHydrated } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react'

import { m } from '#/paraglide/messages'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/shared/ui/alert-dialog'

import { ErrorAlert } from '../error-alert'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that asks: a destructive Button with the verb; none when the app opens it (a switch turned off). */
  trigger?: ReactElement | undefined
  /** Names the object: «Удалить курс «X»?» */
  title: string
  /** The consequence, in one sentence. */
  consequence: string
  /** The destructive verb ("Delete"). */
  confirmLabel: string
  /** None: the dialog only explains (nothing to do), its one button closes it. */
  onConfirm?: (() => void) | undefined
  pending: boolean
  error: unknown
}

const CONTROLS = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'

/** The element and its ancestors up to the body, nearest first. */
const lineage = (node: Element | null): HTMLElement[] => {
  const chain: HTMLElement[] = []
  for (let element = node; element && element !== document.body; element = element.parentElement)
    if (element instanceof HTMLElement) chain.push(element)
  return chain
}

/**
 * Where focus goes back: the trigger when it is still on the page; when the confirmed action took it away (it sat in the
 * removed row), the first control of the nearest container still there, not whatever the browser picks (even a row
 * behind a sheet).
 */
const returnTo = ([trigger, ...containers]: HTMLElement[]): HTMLElement | true => {
  if (trigger?.isConnected) return trigger
  const live = containers.filter(container => container.isConnected)
  return live.map(container => container.querySelector<HTMLElement>(CONTROLS)).find(Boolean) ?? true
}

/**
 * Every destructive action goes through here (DESIGN 8), on the stock AlertDialog. Focus starts on Cancel and goes back
 * to the trigger; when the confirmed action took the trigger away (a role removed, a row deleted), to the first control
 * of the nearest container still on the page.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, trigger, title, consequence, confirmLabel, onConfirm, pending, error } = props
  const cancel = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement[]>([])
  const confirmed = useRef(false)
  // Opened by the app (a «×» that sets the state), not the trigger: what had the focus is the opener. Read before the
  // popup moves the focus to Cancel.
  const byTrigger = useRef(false)
  useLayoutEffect(() => {
    if (!open) return
    if (!byTrigger.current) {
      const from = document.activeElement
      opener.current = lineage(from?.closest(CONTROLS) ?? from)
    }
    byTrigger.current = false
    confirmed.current = false
  }, [open])
  // When the dialog itself sat in the removed row it goes with it, and the popup's return never runs: the same place
  // takes the focus the page dropped. Checked on the next frame, once the removal and the popup's own cleanup are done.
  useEffect(
    () => () => {
      if (!confirmed.current) return
      requestAnimationFrame(() => {
        const target = returnTo(opener.current)
        if (target !== true && (document.activeElement ?? document.body) === document.body) target.focus()
      })
    },
    [],
  )
  // Before hydration a click on an SSR page opens nothing (AGENTS.md): the trigger waits, like the auth fieldset.
  const hydrated = useHydrated()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        // The trigger pressed (Safari does not focus a clicked button).
        const target = details.event.target
        if (next && target instanceof Element) {
          opener.current = lineage(target.closest(CONTROLS) ?? target)
          byTrigger.current = true
        }
        onOpenChange(next)
      }}
    >
      {trigger ? (
        <AlertDialogTrigger
          render={trigger}
          disabled={!hydrated || undefined}
          data-hydrating={hydrated ? undefined : true}
        />
      ) : null}
      <AlertDialogContent initialFocus={cancel} finalFocus={() => returnTo(opener.current)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">
            {onConfirm ? m.ui_cancel() : m.ui_close()}
          </AlertDialogCancel>
          {onConfirm ? (
            <SubmitButton
              variant="destructive"
              pending={pending}
              onClick={() => {
                confirmed.current = true
                onConfirm()
              }}
            >
              {confirmLabel}
            </SubmitButton>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
