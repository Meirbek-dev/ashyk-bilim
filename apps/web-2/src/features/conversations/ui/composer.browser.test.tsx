import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { COUNTER_FROM } from '../model/feed'
import { Composer } from './composer'

const TO = '0190a5d2-0000-7000-8000-0000000000b1'

const sent = (body: { body: string }) => ({
  id: '0190a5d2-0000-7000-8000-0000000000f1',
  conversation_id: '0190a5d2-0000-7000-8000-00000000c0c0',
  user_id: '0190a5d2-0000-7000-8000-0000000000a1',
  body: body.body,
  created_at_unix: 1_772_427_600,
  deleted: false,
  context: null,
  allowed_actions: ['delete'],
})

const failure = () =>
  Response.json(
    { type: 'about:blank', title: 'Internal', status: 500, code: 'internal' },
    { status: 500, headers: { 'content-type': 'application/problem+json' } },
  )

/** `POST /messages` answers from `answers` in turn; every body sent is kept. */
function stubSend(answers: ((body: { body: string }) => Response)[]) {
  const bodies: { body: string; client_key: string; to_user_id: string }[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    const body = await request.json()
    bodies.push(body)
    const answer = answers[bodies.length - 1] ?? answers.at(-1)
    return answer ? answer(body) : failure()
  })
  return bodies
}

const render = (onSent = vi.fn<() => void>()) =>
  renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <Composer to={TO} onSent={onSent} />
    </QueryClientProvider>,
  )

afterEach(() => vi.unstubAllGlobals())

test('Enter sends the text, Shift+Enter breaks the line; the box empties on success', async () => {
  const bodies = stubSend([body => Response.json(sent(body), { status: 201 })])
  const onSent = vi.fn<() => void>()
  const screen = await render(onSent)
  const box = screen.getByRole('textbox', { name: m.conversations_composer_label() })
  await userEvent.click(box)
  await userEvent.keyboard('Hello{Shift>}{Enter}{/Shift}there{Enter}')
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ to_user_id: TO, body: 'Hello\nthere' })
  await expect.element(box).toHaveValue('')
  expect(onSent).toHaveBeenCalledOnce()
})

test('a failed send keeps the text; «Повторить» resends with the same key', async () => {
  const bodies = stubSend([failure, body => Response.json(sent(body), { status: 201 })])
  const screen = await render()
  const box = screen.getByRole('textbox', { name: m.conversations_composer_label() })
  await userEvent.fill(box, 'Question about the quiz')
  await userEvent.click(screen.getByRole('button', { name: m.conversations_send() }))
  await expect.element(screen.getByRole('alert')).toBeVisible()
  await expect.element(box).toHaveValue('Question about the quiz')
  await userEvent.click(screen.getByRole('button', { name: m.conversations_retry() }))
  await expect.poll(() => bodies.length).toBe(2)
  expect(bodies[1]?.client_key).toBe(bodies[0]?.client_key)
  await expect.element(box).toHaveValue('')
})

test('an empty box cannot send; the counter shows near the limit', async () => {
  stubSend([])
  const screen = await render()
  await expect.element(screen.getByRole('button', { name: m.conversations_send() })).toBeDisabled()
  await userEvent.fill(
    screen.getByRole('textbox', { name: m.conversations_composer_label() }),
    'x'.repeat(COUNTER_FROM),
  )
  await expect.element(screen.getByText(m.conversations_chars_left({ count: '200' }))).toBeVisible()
})
