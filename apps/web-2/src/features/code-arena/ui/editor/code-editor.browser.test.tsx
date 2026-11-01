import { undo } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useState } from 'react'
import { beforeAll, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'
import { Button } from '#/shared/ui/button'

import { CodeEditor } from './code-editor'
import { loadMode } from './editor-modes'

const labels = { editable: 'Solution', locked: 'Answer', toggle: 'Toggle read only' }

// Compile the lazy language chunk before the test, as in the editor feature's browser tests.
beforeAll(() => loadMode('python'), 120_000)

function Harness() {
  const [readOnly, setReadOnly] = useState(false)
  const [value, setValue] = useState('answer = 1')
  return (
    <>
      <CodeEditor
        value={value}
        mode="python"
        label={readOnly ? labels.locked : labels.editable}
        readOnly={readOnly}
        onChange={setValue}
      />
      <Button onClick={() => setReadOnly(current => !current)}>{labels.toggle}</Button>
    </>
  )
}

test('B-COD-05 B-COD-15 changing the label and read-only state preserves the language, selection and undo history', async () => {
  const screen = await renderInRouter(<Harness />)
  const input = screen.getByRole('textbox', { name: labels.editable })
  await expect.element(input).toBeVisible()
  const editor = document.querySelector('.cm-editor')
  if (!(editor instanceof HTMLElement)) throw new Error('CodeMirror did not mount')
  const view = EditorView.findFromDOM(editor)
  if (!view) throw new Error('CodeMirror view is missing')
  await expect.poll(() => syntaxTree(view.state).topNode.name, { timeout: 15_000 }).toBe('Script')
  await input.click()
  await userEvent.keyboard('{End}0')
  expect(view.state.doc.toString()).toBe('answer = 10')
  // The cursor's line is marked in the text and in the gutter (the theme styles both).
  expect(editor.querySelector('.cm-activeLine')).not.toBeNull()
  expect(editor.querySelector('.cm-activeLineGutter')).not.toBeNull()
  const selection = view.state.selection.toJSON()
  await screen.getByRole('button', { name: labels.toggle }).click()
  await expect.element(screen.getByLabelText(labels.locked)).toHaveAttribute('contenteditable', 'false')
  expect(EditorView.findFromDOM(editor)).toBe(view)
  expect(view.state.facet(EditorState.readOnly)).toBe(true)
  expect(view.state.selection.toJSON()).toEqual(selection)
  expect(syntaxTree(view.state).topNode.name).toBe('Script')
  await screen.getByRole('button', { name: labels.toggle }).click()
  await expect.element(input).toHaveAttribute('contenteditable', 'true')
  expect(undo(view)).toBe(true)
  expect(view.state.doc.toString()).toBe('answer = 1')
})

/** The mounted view, to read what the learner's keys did. */
function mountedView() {
  const editor = document.querySelector('.cm-editor')
  const view = editor instanceof HTMLElement ? EditorView.findFromDOM(editor) : null
  if (!view) throw new Error('CodeMirror view is missing')
  return view
}

test('B-COD-32 Ctrl+Enter runs, Ctrl+Shift+Enter asks to submit and Ctrl+S saves, without typing into the code', async () => {
  const keys = { run: vi.fn<() => void>(), submit: vi.fn<() => void>(), save: vi.fn<() => void>() }
  const screen = await renderInRouter(
    <div className="flex h-96 flex-col">
      <CodeEditor fill value="total = 1" mode="python" label={labels.editable} keys={keys} />
    </div>,
  )
  await screen.getByRole('textbox', { name: labels.editable }).click()
  await userEvent.keyboard('{Control>}{Enter}{/Control}')
  await userEvent.keyboard('{Control>}{Shift>}{Enter}{/Shift}{/Control}')
  await userEvent.keyboard('{Control>}s{/Control}')
  expect([keys.run.mock.calls.length, keys.submit.mock.calls.length, keys.save.mock.calls.length]).toEqual([1, 1, 1])
  expect(mountedView().state.doc.toString()).toBe('total = 1')
  // The cursor line under the editor follows the caret.
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByText(m.code_cursor({ line: '1', column: '1' }))).toBeVisible()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByText(m.code_cursor({ line: '1', column: '10' }))).toBeVisible()
})

test('B-COD-33 brackets close themselves, words of the file complete and Ctrl+F searches in the page language', async () => {
  const screen = await renderInRouter(
    <div className="flex h-96 flex-col">
      <CodeEditor fill value="" mode="python" label={labels.editable} onChange={() => undefined} />
    </div>,
  )
  await screen.getByRole('textbox', { name: labels.editable }).click()
  await userEvent.keyboard('numbers = [[')
  expect(mountedView().state.doc.toString()).toBe('numbers = []')
  await userEvent.keyboard('{End}{Enter}num')
  await expect.element(screen.getByRole('option', { name: 'numbers' })).toBeVisible()
  // CodeMirror ignores Enter for `interactionDelay` (75 ms) after the list opens, so a fast Enter types a newline.
  const shown = Date.now()
  await vi.waitFor(() => expect(Date.now() - shown).toBeGreaterThan(100))
  await userEvent.keyboard('{Enter}')
  expect(mountedView().state.doc.toString()).toBe('numbers = []\nnumbers')
  await userEvent.keyboard('{Control>}f{/Control}')
  await expect.element(screen.getByRole('textbox', { name: m.code_cm_find() })).toBeVisible()
})
