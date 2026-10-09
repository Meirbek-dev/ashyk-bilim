/**
 * The catalogs in `src/messages` use the inlang message format (Paraglide, stage 2), while next-intl
 * reads ICU MessageFormat strings. This converts a catalog at load time so both can share one source:
 * - markup `{#link}…{/link}` / `{#br/}` → next-intl rich-text tags `<link>…</link>` / `<br></br>`;
 * - a complex message `[{declarations, selectors, match}]` → nested ICU `plural`/`select`, with
 *   `number` / `datetime` locals inlined as `{x, number}` / `{x, date, …}` arguments.
 */

interface ComplexMessage {
  declarations?: string[]
  selectors?: string[]
  match: Record<string, string>
}

interface Local {
  input: string
  fn: string
  options: Record<string, string>
}

const markup = (pattern: string): string =>
  pattern
    .replaceAll(/\{#([\w-]+)\/\}/g, '<$1></$1>')
    .replaceAll(/\{#([\w-]+)\}/g, '<$1>')
    .replaceAll(/\{\/([\w-]+)\}/g, '</$1>')

function datetimeArgument(input: string, options: Record<string, string>): string {
  // Date-only and time-only styles, matching what the ICU catalog used before the migration.
  if (options.hour && !options.month) return `{${input}, time, short}`
  if (options.month === 'long') return `{${input}, date, long}`
  if (options.month === 'short') return `{${input}, date, medium}`
  return `{${input}, date, short}`
}

function parseLocals(declarations: string[]): Map<string, Local> {
  const locals = new Map<string, Local>()
  for (const declaration of declarations) {
    const match = /^local (\S+) = (\S+): (\w+)(.*)$/.exec(declaration)
    if (!match) continue
    const [, name = '', input = '', fn = '', rest = ''] = match
    const options: Record<string, string> = {}
    for (const option of rest.trim().split(/\s+/).filter(Boolean)) {
      const [key = '', value = ''] = option.split('=')
      options[key] = value
    }
    locals.set(name, { input, fn, options })
  }
  return locals
}

function convertComplex(message: ComplexMessage): string {
  const locals = parseLocals(message.declarations ?? [])
  // Inside an ICU plural a bare `#` is the count ("Attempt #{n}" would print the count), so quote it.
  const inline = (pattern: string, inPlural: boolean): string =>
    markup(inPlural ? pattern.replaceAll('#', "'#'") : pattern).replaceAll(/\{(\w+)\}/g, (whole, name: string) => {
      const local = locals.get(name)
      if (!local) return whole
      if (local.fn === 'number') return `{${local.input}, number}`
      if (local.fn === 'datetime') return datetimeArgument(local.input, local.options)
      return `{${local.input}}`
    })

  const variants = Object.entries(message.match).map(([condition, pattern]) => ({
    keys: new Map(
      condition.split(',').map(part => {
        const [name = '', value = ''] = part.trim().split('=')
        return [name, value] as const
      }),
    ),
    pattern,
  }))

  const build = (selectors: string[], rows: typeof variants, inPlural = false): string => {
    const [selector, ...rest] = selectors
    if (selector === undefined) return inline(rows[0]?.pattern ?? '', inPlural)
    const local = locals.get(selector)
    const input = local?.input ?? selector
    const values = [...new Set(rows.map(row => row.keys.get(selector) ?? '*'))]
    const numeric = values.every(value => value === '*' || /^-?\d+(\.\d+)?$/.test(value))
    const kind = local?.fn === 'plural' || numeric ? 'plural' : 'select'
    const cases = values.map(value => {
      const key = value === '*' ? 'other' : local?.fn === 'plural' ? value : kind === 'plural' ? `=${value}` : value
      return `${key} {${build(
        rest,
        rows.filter(row => (row.keys.get(selector) ?? '*') === value),
        inPlural || kind === 'plural',
      )}}`
    })
    if (!values.includes('*')) cases.push('other {}')
    return `{${input}, ${kind}, ${cases.join(' ')}}`
  }

  return build(message.selectors ?? [], variants)
}

export function inlangToIcu(value: unknown): unknown {
  if (typeof value === 'string') return markup(value)
  if (Array.isArray(value)) {
    const [message] = value
    return message && typeof message === 'object' && !Array.isArray(message) && 'match' in message
      ? convertComplex(message as unknown as ComplexMessage)
      : value
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key !== '$schema') out[key] = inlangToIcu(child)
    }
    return out
  }
  return value
}
