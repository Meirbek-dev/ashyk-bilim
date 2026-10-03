import { Suspense, useState, type ReactNode } from 'react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { sanitize } from '../model/sanitize'
import { MarkdownEditor, MarkdownView } from '../index'

const CODE = '```\nx = 1\n```'
const render = (ui: ReactNode) => renderInRouter(<Suspense>{ui}</Suspense>)

const TEXT = [
  '## Задача',
  '',
  'Найдите **сумму** $a+b$ и ~~не~~ выведите её.',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '```python',
  'print(1)',
  '```',
  '',
  '[docs](https://example.com) [local](/courses/1) [bad](javascript:alert(1))',
  '',
  '![chart](/content/c.png) ![pixel](https://tracker.example/p.gif)',
  '',
  '<b onclick="alert(1)">raw</b>',
].join('\n')

describe('B-MD-01 renderer', () => {
  test('B-MD-01 GFM, math and highlighted code', async () => {
    const screen = await render(<MarkdownView content={TEXT} />)
    await expect.element(screen.getByRole('heading', { level: 2, name: 'Задача' })).toBeVisible()
    await expect.element(screen.getByRole('table')).toBeVisible()
    await expect.poll(() => document.querySelector('.katex') !== null).toBe(true)
    await expect.poll(() => document.querySelector('.shiki span[style*="--shiki-light"]') !== null).toBe(true)
    await expect.element(screen.getByText('python')).toBeVisible()
  })

  test('B-MD-02 B-MD-03 B-MD-04 links, images and raw HTML are safe', async () => {
    const screen = await render(<MarkdownView content={TEXT} />)
    const docs = screen.getByRole('link', { name: 'docs' })
    await expect.element(docs).toHaveAttribute('target', '_blank')
    await expect.element(docs).toHaveAttribute('rel', 'noopener noreferrer')
    await expect.element(screen.getByRole('link', { name: 'local' })).not.toHaveAttribute('target')
    await expect.element(screen.getByText('bad')).not.toHaveAttribute('href', 'javascript:alert(1)')
    await expect.element(screen.getByRole('img', { name: 'chart' })).toHaveAttribute('src', '/content/c.png')
    await expect.element(screen.getByText(m.markdown_image({ alt: 'pixel' }))).toBeVisible()
    expect(document.querySelector('.ab-prose [onclick], .ab-prose b')).toBeNull()
  })

  test('B-MD-08 a code block copies its code', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const screen = await render(<MarkdownView content={CODE} />)
    await screen.getByRole('button', { name: m.markdown_copy() }).click()
    expect(writeText).toHaveBeenCalledWith('x = 1')
    await expect.element(screen.getByRole('button', { name: m.markdown_copied() })).toBeVisible()
  })

  test('B-MD-09 a streamed answer is a polite live region', async () => {
    const screen = await render(<MarkdownView content="Ответ" live />)
    await expect.element(screen.getByText('Ответ')).toBeVisible()
    expect(document.querySelector('.ab-prose')?.getAttribute('aria-live')).toBe('polite')
  })

  test('B-MD-05 sanitize drops scripts and handlers in the browser', () => {
    expect(sanitize('<p onclick="x()">ok</p><script>alert(1)</script><img src=x onerror=alert(1)>')).toBe(
      '<p>ok</p><img src="x">',
    )
  })
})

function Controlled({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('Есть **жирный** и $x^2$.')
  return (
    <MarkdownEditor
      label={m.markdown_toolbar()}
      value={value}
      onChange={next => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('B-MD-07 markdown editor', () => {
  test('B-MD-07 markdown in, edited, markdown out', async () => {
    const onChange = vi.fn<(value: string) => void>()
    const screen = await render(<Controlled onChange={onChange} />)
    const box = screen.getByRole('textbox', { name: m.markdown_toolbar() })
    await expect.element(box.getByText('жирный')).toBeVisible()
    await box.click()
    await userEvent.keyboard('{Control>}{End}{/Control}{Enter}Новая строка')
    await expect.poll(() => onChange.mock.lastCall?.[0]).toBe('Есть **жирный** и $x^2$.\n\nНовая строка')
    await userEvent.keyboard('{Shift>}{Home}{/Shift}')
    await screen.getByRole('button', { name: m.markdown_italic() }).click()
    await expect.poll(() => onChange.mock.lastCall?.[0]).toBe('Есть **жирный** и $x^2$.\n\n*Новая строка*')
  })
})
