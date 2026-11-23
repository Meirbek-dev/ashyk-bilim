import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { beforeAll, expect, test } from 'vite-plus/test'

import { CodeBlock } from './code-block'
import { loadLanguage } from './languages'

// Load the grammar before assertions (a cold chunk competes with the full suite); a hook that resolves to a function
// would have it run as teardown, so the language is not returned.
beforeAll(async () => {
  await loadLanguage('python')
}, 120_000)

const PYTHON = 'def f():\n    return "x"  # note'
const colored = (host: HTMLElement) => host.querySelector('code span[class]')

test('B-MD-01 changing highlighted code to an unknown language immediately shows the new source', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<CodeBlock code="print(1)" language="python" />))
    await expect.poll(() => colored(host) !== null).toBe(true)
    expect(host.querySelector('code')?.textContent).toBe('print(1)')
    flushSync(() => root.render(<CodeBlock code="new plain source" language="unknown-language" />))
    expect(host.querySelector('code')?.textContent).toBe('new plain source')
    expect(colored(host)).toBeNull()
    // The parser is loaded: the next python block colors in its first render.
    flushSync(() => root.render(<CodeBlock code="print(2)" language="py" />))
    expect(host.querySelector('code')?.textContent).toBe('print(2)')
    expect(colored(host)).not.toBeNull()
  } finally {
    flushSync(() => root.unmount())
  }
})

test('B-MD-01 token colors are the code editor theme classes', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<CodeBlock code={PYTHON} language="python" />))
    const keyword = host.querySelector('code span.text-info')
    expect(keyword?.textContent).toBe('def')
    expect(host.querySelector('code span.text-success')?.textContent).toBe('"x"')
    const comment = [...host.querySelectorAll('code span')].find(span => span.textContent.startsWith('#'))
    expect(comment?.className).toBe('text-muted-foreground')
  } finally {
    flushSync(() => root.unmount())
    host.remove()
  }
})
