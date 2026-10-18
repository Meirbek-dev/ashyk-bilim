import { undo } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useState } from 'react'
import { beforeAll, expect, test } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

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
