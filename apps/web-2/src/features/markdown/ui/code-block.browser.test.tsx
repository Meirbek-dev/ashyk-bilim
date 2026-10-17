import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { beforeAll, expect, test } from 'vite-plus/test'

import { CodeBlock } from './code-block'
import { highlighter } from './shiki'

// Load the grammar before assertions; a cold chunk competes with the full browser suite.
beforeAll(() => highlighter('python'), 120_000)

test('B-MD-01 changing highlighted code to an unknown language immediately shows the new source', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<CodeBlock code="print(1)" language="python" />))
    await expect.poll(() => host.querySelector('.shiki')?.textContent).toBe('print(1)')
    flushSync(() => root.render(<CodeBlock code="new plain source" language="unknown-language" />))
    expect(host.querySelector('code')?.textContent).toBe('new plain source')
    expect(host.querySelector('.shiki')).toBeNull()
    flushSync(() => root.render(<CodeBlock code="print(2)" language="python" />))
    expect(host.querySelector('code')?.textContent).toBe('print(2)')
    await expect.poll(() => host.querySelector('.shiki')?.textContent).toBe('print(2)')
  } finally {
    flushSync(() => root.unmount())
  }
})
