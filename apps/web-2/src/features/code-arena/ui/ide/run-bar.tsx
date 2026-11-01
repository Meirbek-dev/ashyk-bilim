import { Play } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { printedKeys } from '#/shared/lib/key-label'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { SubmitDialog } from '../submit-dialog'

type RunBarProps = {
  /** What «Запустить» runs on now: the sample tests or the own input (B-COD-29). */
  target: 'samples' | 'input'
  canRun: boolean
  running: boolean
  onRun: () => void
  canSubmit: boolean
  submitting: boolean
  confirming: boolean
  onConfirming: (open: boolean) => void
  onSubmit: () => void
  attempt: { number: number; max: number | null }
}

/** The workspace's last row: «Запустить» (secondary) and what it runs on, «Сдать» (the page's primary step). */
export function RunBar(props: RunBarProps) {
  const { target, canRun, running, onRun, canSubmit, submitting, confirming, onConfirming, onSubmit, attempt } = props
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t px-3 py-2">
      <span className="text-sm text-muted-foreground">
        {target === 'input' ? m.code_run_target_input() : m.code_run_target_samples()}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={!canRun}
          // Run after run from the keyboard: focus stays on «Запустить» while it runs.
          focusableWhenDisabled
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onClick={onRun}
        >
          {running ? <Spinner data-icon="inline-start" /> : <Play aria-hidden data-icon="inline-start" />}
          {m.code_run()}
          <kbd aria-hidden className="font-sans text-xs text-muted-foreground tabular-nums max-sm:hidden">
            {printedKeys('Mod-Enter')}
          </kbd>
        </Button>
        <SubmitDialog
          number={attempt.number}
          max={attempt.max}
          disabled={!canSubmit}
          open={confirming}
          onOpenChange={onConfirming}
          onConfirm={onSubmit}
          trigger={
            <>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {m.code_submit()}
            </>
          }
        />
      </div>
    </div>
  )
}
