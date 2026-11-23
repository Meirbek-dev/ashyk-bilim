/** One dispatched server-sent event. `id` is the `id:` field of this event only (`null` when it had none). */
export type SseMessage = { id: string | null; event: string; data: string }

/**
 * Reads a `text/event-stream` body as the HTML spec's event-stream parser does: UTF-8 with an optional BOM, LF, CR or
 * CRLF line ends split anywhere across chunks, `:` comments (the server's keep-alive), multi-line `data:`, and an
 * event dispatched by its blank line; an unfinished event at the end of the stream is dropped. `retry:` is ignored:
 * the callers decide when to reconnect. Returning early (a `break`) or an abort cancels the body.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const lines = new SseLines()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        for (const message of [...lines.push(decoder.decode()), ...lines.end()]) yield message
        return
      }
      for (const message of lines.push(decoder.decode(value, { stream: true }))) yield message
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

/** The line and field state of one stream; `push` takes decoded text and answers the events it completed. */
export class SseLines {
  private buffer = ''
  private first = true
  private data: string[] = []
  private event = ''
  private id: string | null = null

  push(text: string): SseMessage[] {
    this.buffer += text
    if (this.first && this.buffer.length > 0) {
      this.first = false
      if (this.buffer.startsWith('﻿')) this.buffer = this.buffer.slice(1)
    }
    const messages: SseMessage[] = []
    let start = 0
    for (let index = 0; index < this.buffer.length; index += 1) {
      const char = this.buffer[index]
      if (char !== '\n' && char !== '\r') continue
      // A CR as the last character may be the first half of a CRLF split across chunks: wait for the next one.
      if (char === '\r' && index === this.buffer.length - 1) break
      const message = this.line(this.buffer.slice(start, index))
      if (message) messages.push(message)
      if (char === '\r' && this.buffer[index + 1] === '\n') index += 1
      start = index + 1
    }
    this.buffer = this.buffer.slice(start)
    return messages
  }

  /** The stream closed: a CR held back for a CRLF ends its line. */
  end(): SseMessage[] {
    return this.buffer.endsWith('\r') ? this.push('\n') : []
  }

  private line(line: string): SseMessage | null {
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return null
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') this.data.push(value)
    else if (field === 'event') this.event = value
    else if (field === 'id' && !value.includes('\0')) this.id = value
    return null
  }

  private dispatch(): SseMessage | null {
    const message =
      this.data.length > 0 ? { id: this.id, event: this.event || 'message', data: this.data.join('\n') } : null
    this.data = []
    this.event = ''
    this.id = null
    return message
  }
}
