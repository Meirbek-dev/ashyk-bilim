import { describe, expect, test } from 'vite-plus/test'

import { readSse, SseLines, type SseMessage } from './sse'

/** Feeds `text` to a parser in pieces of `size` characters. */
function parse(text: string, size: number): SseMessage[] {
  const lines = new SseLines()
  const messages: SseMessage[] = []
  for (let start = 0; start < text.length; start += size) messages.push(...lines.push(text.slice(start, start + size)))
  return [...messages, ...lines.end()]
}

const STREAM =
  ': keep-alive\n\nid: run-started\nevent: run\ndata: {"type":"RUN_STARTED"}\n\r\n' +
  'id: 1730000000000-1\r\ndata: {"a":\r\ndata:1}\r\n\r\n' +
  'data:no space\rdata\r\r'

const EXPECTED: SseMessage[] = [
  { id: 'run-started', event: 'run', data: '{"type":"RUN_STARTED"}' },
  { id: '1730000000000-1', event: 'message', data: '{"a":\n1}' },
  { id: null, event: 'message', data: 'no space\n' },
]

describe('SseLines', () => {
  test('LF, CRLF and CR line ends, comments, multi-line data and ids, split at any character', () => {
    for (let size = 1; size <= STREAM.length; size += 1) expect(parse(STREAM, size)).toEqual(EXPECTED)
  })

  test('a leading BOM is skipped; an event without its blank line at the end of the stream is dropped', () => {
    expect(parse('﻿data: one\n\ndata: cut', 3)).toEqual([{ id: null, event: 'message', data: 'one' }])
  })

  test('an event with no data dispatches nothing; an id with NUL is ignored', () => {
    expect(parse('event: x\n\nid: a\0b\ndata: y\n\n', 4)).toEqual([{ id: null, event: 'message', data: 'y' }])
  })
})

describe('readSse', () => {
  test('decodes UTF-8 split inside a character across chunks', async () => {
    const bytes = new TextEncoder().encode('data: әғқңөұүһі\n\n')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const messages: SseMessage[] = []
    for await (const message of readSse(body)) messages.push(message)
    expect(messages).toEqual([{ id: null, event: 'message', data: 'әғқңөұүһі' }])
  })

  test('leaving the loop early cancels the body', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('data: x\n\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const message of readSse(body)) {
      expect(message.data).toBe('x')
      break
    }
    expect(cancelled).toBe(true)
  })
})
