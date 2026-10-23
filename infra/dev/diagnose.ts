// Never send entire logs, trace snapshots or minified lines to an agent's context.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const limit = (text: string, size = 500) => text.replace(/\x1b\[[0-9;]*m/g, '').slice(0, size)
const failure = /error|failed|timeout|expected|received|locator:|spec\.[cm]?[jt]sx?:\d+/i

export async function summarize(lines: AsyncIterable<string>, trace = false): Promise<string> {
  const selected: string[] = []
  const tail: string[] = []
  let context = 0
  let number = 0
  for await (const line of lines) {
    number++
    let text = line
    if (trace) {
      try {
        const event = JSON.parse(line)
        if (event.type === 'before') text = `${event.startTime}: ${event.title ?? event.method}`
        else if (event.type === 'console') text = `${event.time}: ${event.text}`
        else if (event.type === 'error' || /error/i.test(event.method ?? ''))
          text = `${event.time ?? ''}: ${JSON.stringify(event.params?.error ?? event.message ?? event.error)}`
        else continue // snapshots, resources, evaluation results can be megabytes each
      } catch {
        continue
      }
    }
    text = `${number}: ${limit(text)}`
    tail.push(text)
    if (tail.length > 25) tail.shift()
    if (trace || failure.test(line)) context = 4
    if (context-- > 0) {
      selected.push(text)
      if (selected.length > 40) selected.shift()
    }
  }
  return limit((selected.length ? selected : tail).join('\n').slice(-12_000), 12_000)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const trace = args[0] === '--trace'
  const path = args[trace ? 1 : 0]
  if (!path) {
    console.error('usage: just diagnose [--trace] <log or extracted .trace file>')
    process.exit(1)
  }
  try {
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
    console.log(await summarize(lines, trace))
    console.log(`Full source: ${path}`)
  } catch (error) {
    console.error(limit(String(error)))
    process.exit(1)
  }
}
