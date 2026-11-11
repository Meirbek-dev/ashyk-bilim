import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Message } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'
import { formatFileSize } from '#/shared/i18n/format'

import { buildFeed } from '../model/feed'
import { FeedRows } from './feed-rows'

const ME = '0190a5d2-0000-7000-8000-0000000000a1'
const PEER = '0190a5d2-0000-7000-8000-0000000000b1'
const COURSE = '0190a5d2-0000-7000-8000-0000000000c1'
const AT = 1_772_427_600

const message = (n: number, user: string, extra: Partial<Message> = {}): Message => ({
  id: `0190a5d2-0000-7000-8000-00000000000${n}`,
  conversation_id: '0190a5d2-0000-7000-8000-00000000c0c0',
  user_id: user,
  body: `Message ${n}`,
  created_at_unix: AT + n,
  deleted: false,
  context: null,
  attachments: [],
  allowed_actions: [],
  ...extra,
})

const render = (oldestFirst: Message[]) => {
  const rows = buildFeed({ pages: [oldestFirst.toReversed()], viewer: ME, lastRead: null, now: AT })
  return renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <ol>
        <FeedRows rows={rows} peerName="Teacher A" peerAvatar={null} />
      </ol>
    </QueryClientProvider>,
  )
}

test("the other person's message: its context link, «Пожаловаться», the new-messages line before it", async () => {
  const context = {
    course_id: COURSE,
    course_name: 'Algebra',
    activity_id: null,
    activity_name: null,
    activity_type: null,
  }
  const screen = await render([message(1, PEER, { context, allowed_actions: ['report'] })])
  await expect.element(screen.getByText(m.conversations_new_divider())).toBeVisible()
  await expect.element(screen.getByText('Teacher A')).toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: m.conversations_context_course({ course: 'Algebra' }) }))
    .toHaveAttribute('href', `/courses/${COURSE}`)
  await expect.element(screen.getByRole('button', { name: m.conversations_report() })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: m.conversations_delete() })).not.toBeInTheDocument()
})

test("one's own message offers «Удалить»; a deleted one shows the mark, not its text", async () => {
  const screen = await render([
    message(1, ME, { allowed_actions: ['delete'] }),
    message(2, PEER, { deleted: true, body: '' }),
  ])
  await expect.element(screen.getByText(m.conversations_you())).toBeVisible()
  await expect.element(screen.getByRole('button', { name: m.conversations_delete() })).toBeVisible()
  await expect.element(screen.getByText(m.conversations_deleted())).toBeVisible()
  await expect.element(screen.getByRole('button', { name: m.conversations_report() })).not.toBeInTheDocument()
})

test('a message of files alone lists them with their sizes', async () => {
  const attachments = [
    { upload_id: '0190a5d2-0000-7000-8000-0000000000e1', name: 'plan.pdf', mime: 'application/pdf', size_bytes: 2048 },
    { upload_id: '0190a5d2-0000-7000-8000-0000000000e2', name: 'data.zip', mime: 'application/zip', size_bytes: 10 },
  ]
  const screen = await render([message(1, PEER, { body: '', attachments })])
  await expect.element(screen.getByRole('button', { name: 'plan.pdf' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'data.zip' })).toBeVisible()
  await expect.element(screen.getByText(formatFileSize(2048))).toBeVisible()
})
