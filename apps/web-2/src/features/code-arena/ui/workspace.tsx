import { useState, type CSSProperties } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, StudentSubmission } from '#/shared/api/gen/types.gen'

import type { CodeItem } from '../model/arena'
import { DraftClock } from './draft-clock'
import { ConsolePanel } from './ide/console-panel'
import { EditorPane } from './ide/editor-pane'
import { IdeToolbar } from './ide/ide-toolbar'
import { RunBar } from './ide/run-bar'
import { RunNotices } from './ide/run-notices'
import { SplitPane } from './ide/split-pane'
import { usePrefs } from './ide/use-prefs'
import { useWorkspace } from './ide/use-workspace'

type Height = CSSProperties & Record<'--ide-height', string>

type WorkspaceProps = {
  courseId: string
  challenge: AssessmentDetail
  code: CodeItem
  draft: StudentSubmission
  /** When the attempt list (with the draft's remaining seconds) arrived. */
  receivedAt: number
}

/**
 * The open attempt as a desktop IDE (B-COD-05..10, B-COD-29..33): toolbar, the editor over the console with a
 * divider, «Запустить» and «Сдать». The code lives here while typing and goes to the server draft after a pause
 * (B-COD-06). A runner that is down leaves the editor and the draft working; running waits for «Повторить» (B-COD-23).
 */
export function Workspace({ courseId, challenge, code, draft, receivedAt }: WorkspaceProps) {
  const work = useWorkspace({ courseId, assessmentId: challenge.id }, code, draft)
  const { runner, languages, answer, saver, actions } = work
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { prefs, update } = usePrefs()
  return (
    <section
      aria-labelledby="code-workspace"
      data-expanded={expanded || undefined}
      // Viewport-tall under the page bar, so the editor, the console and «Сдать» are all in sight; never cramped.
      style={{ '--ide-height': 'max(30rem, min(calc(100svh - 6rem), 60rem))' } as Height}
      className="flex h-(--ide-height) min-w-0 flex-col overflow-hidden rounded-xl border bg-background data-expanded:fixed data-expanded:inset-0 data-expanded:z-50 data-expanded:h-auto data-expanded:rounded-none data-expanded:border-0 @5xl:sticky @5xl:top-18"
    >
      <h2 id="code-workspace" className="sr-only">
        {m.code_solution()}
      </h2>
      <IdeToolbar
        body={code.body}
        answer={answer}
        languages={languages}
        onAnswer={work.change}
        prefs={prefs}
        onPrefs={update}
        expanded={expanded}
        onExpand={setExpanded}
        clock={<DraftClock draft={draft} receivedAt={receivedAt} onExpire={work.handIn} />}
        saved={saver.status}
      />
      <SplitPane
        share={prefs.split}
        onShare={split => update({ split })}
        label={m.code_split()}
        top={
          <EditorPane
            answer={answer}
            languages={languages}
            prefs={prefs}
            keys={{ run: work.runCode, submit: () => setConfirming(work.canSubmit), save: saver.flush }}
            onChange={work.change}
          />
        }
        bottom={
          <ConsolePanel
            mode={work.mode}
            onMode={work.setMode}
            samples={work.samples}
            input={work.input}
            onInput={work.setInput}
            runId={work.run}
            running={actions.running}
          />
        }
      />
      <RunNotices
        runner={runner.data.state}
        down={work.down}
        error={actions.error}
        retrying={runner.isFetching}
        onRetry={work.retry}
      />
      <RunBar
        target={work.target}
        canRun={work.canRun}
        running={actions.running}
        onRun={work.runCode}
        canSubmit={work.canSubmit}
        submitting={actions.submitting}
        confirming={confirming}
        onConfirming={setConfirming}
        onSubmit={work.handIn}
        attempt={{ number: draft.attempt_number, max: challenge.policy.max_attempts }}
      />
    </section>
  )
}
