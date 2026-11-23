import type { JSONContent } from '@tiptap/core'
import { Fragment, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import { safeImageUrl, safeUrl } from '../model/sanitize'
import { CodeBlock } from './code-block'
import { TaskItem } from './task-item'

type Katex = (typeof import('./math'))['katex']
type Mark = NonNullable<JSONContent['marks']>[number]
type Context = { katex: Katex | null }

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
const ALIGN: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right' }

/** Links: http(s), mailto, relative and anchors; absolute ones open in a new tab without the opener. */
function link(mark: Mark, children: ReactNode): ReactNode {
  const href = safeUrl(str(mark.attrs?.['href']))
  const title = str(mark.attrs?.['title'])
  return href && /^https?:\/\//i.test(href) ? (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <a href={href} title={title}>
      {children}
    </a>
  )
}

function markElement(mark: Mark, children: ReactNode): ReactNode {
  switch (mark.type) {
    case 'link':
      return link(mark, children)
    case 'bold':
      return <strong>{children}</strong>
    case 'italic':
      return <em>{children}</em>
    case 'strike':
      return <del>{children}</del>
    case 'underline':
      return <u>{children}</u>
    case 'code':
      return <code>{children}</code>
    default:
      return children
  }
}

// Tiptap's mark order (link outermost): neighbours sharing a mark share one element (one link, not two).
const RANK = ['link', 'bold', 'code', 'italic', 'strike', 'underline']
const rank = (mark: Mark) => (RANK.includes(mark.type) ? RANK.indexOf(mark.type) : RANK.length)
const sameMark = (a: Mark, b: Mark | undefined) =>
  b !== undefined && a.type === b.type && JSON.stringify(a.attrs) === JSON.stringify(b.attrs)

/** A formula as KaTeX renders it; a malformed one shows its source in KaTeX's error ink. */
function formula(latex: string, display: boolean, katex: Katex | null, key: number): ReactNode {
  if (!katex) return <code key={key}>{latex}</code>
  const html = katex.renderToString(latex, { displayMode: display, throwOnError: false })
  const Tag = display ? 'div' : 'span'
  // oxlint-disable-next-line react/no-danger -- KaTeX's own markup for the formula (trust off: no links, no raw HTML)
  return <Tag key={key} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Images only from platform storage: anything else (a tracking pixel, a hotlink) reads as its description. */
function picture(attrs: Record<string, unknown>, key: number): ReactNode {
  const src = safeImageUrl(str(attrs['src']))
  const alt = str(attrs['alt']) ?? ''
  if (src) return <img key={key} src={src} alt={alt} title={str(attrs['title'])} loading="lazy" />
  return (
    <span key={key} className="text-muted-foreground">
      {alt ? m.markdown_image({ alt }) : m.markdown_image_untitled()}
    </span>
  )
}

function leaf(node: JSONContent, context: Context, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return node.text ?? null
    case 'hardBreak':
      return <br key={key} />
    case 'inlineMath':
      return formula(str(node.attrs?.['latex']) ?? '', false, context.katex, key)
    case 'image':
      return picture(node.attrs ?? {}, key)
    default:
      return null
  }
}

function grouped(nodes: JSONContent[], depth: number, context: Context): ReactNode[] {
  const out: ReactNode[] = []
  let start = 0
  while (start < nodes.length) {
    const node = nodes[start]
    const mark = node?.marks?.[depth]
    const stop = mark ? nodes.findIndex((next, index) => index > start && !sameMark(mark, next.marks?.[depth])) : -1
    const end = mark ? (stop === -1 ? nodes.length : stop) : start + 1
    if (mark)
      out.push(
        <Fragment key={start}>{markElement(mark, grouped(nodes.slice(start, end), depth + 1, context))}</Fragment>,
      )
    else if (node) out.push(<Fragment key={start}>{leaf(node, context, start)}</Fragment>)
    start = end
  }
  return out
}

function inline(nodes: JSONContent[] | undefined, context: Context): ReactNode[] {
  const sorted = (nodes ?? []).map(node =>
    node.marks ? { ...node, marks: node.marks.toSorted((a, b) => rank(a) - rank(b)) } : node,
  )
  return grouped(sorted, 0, context)
}

function tableRow(cells: JSONContent, context: Context, key: number): ReactNode {
  return (
    <tr key={key}>
      {(cells.content ?? []).map((cell, column) => {
        const Tag = cell.type === 'tableHeader' ? 'th' : 'td'
        const colSpan = num(cell.attrs?.['colspan'], 1)
        const rowSpan = num(cell.attrs?.['rowspan'], 1)
        return (
          <Tag
            key={column}
            colSpan={colSpan === 1 ? undefined : colSpan}
            rowSpan={rowSpan === 1 ? undefined : rowSpan}
            className={ALIGN[str(cell.attrs?.['align']) ?? '']}
          >
            {blocks(cell.content, context)}
          </Tag>
        )
      })}
    </tr>
  )
}

/** A GFM table: its header row in `thead` (Tiptap keeps it as a row of header cells). */
function table(node: JSONContent, context: Context, key: number): ReactNode {
  const rows = node.content ?? []
  const [first, ...rest] = rows
  const header = first?.content?.every(cell => cell.type === 'tableHeader') ? first : undefined
  return (
    <table key={key}>
      {header ? <thead>{tableRow(header, context, 0)}</thead> : null}
      <tbody>{(header ? rest : rows).map((cells, index) => tableRow(cells, context, index))}</tbody>
    </table>
  )
}

function block(node: JSONContent, context: Context, key: number): ReactNode {
  const attrs = node.attrs ?? {}
  switch (node.type) {
    case 'paragraph':
      // The editor keeps extra blank lines as empty paragraphs; read, they are no block (as CommonMark renders them).
      return node.content?.length ? <p key={key}>{inline(node.content, context)}</p> : null
    case 'heading': {
      const Tag = HEADINGS[num(attrs['level'], 1) - 1] ?? 'h6'
      return <Tag key={key}>{inline(node.content, context)}</Tag>
    }
    case 'blockquote':
      return <blockquote key={key}>{blocks(node.content, context)}</blockquote>
    case 'bulletList':
      return <ul key={key}>{blocks(node.content, context)}</ul>
    case 'orderedList': {
      const start = num(attrs['start'], 1)
      return (
        <ol key={key} start={start === 1 ? undefined : start}>
          {blocks(node.content, context)}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{blocks(node.content, context)}</li>
    case 'taskList':
      return (
        <ul key={key} className="list-none ps-0">
          {blocks(node.content, context)}
        </ul>
      )
    case 'taskItem':
      return (
        <TaskItem key={key} checked={attrs['checked'] === true}>
          {blocks(node.content, context)}
        </TaskItem>
      )
    case 'codeBlock':
      return (
        <CodeBlock
          key={key}
          code={(node.content ?? []).map(child => child.text ?? '').join('')}
          language={str(attrs['language'])}
        />
      )
    case 'blockMath':
      return formula(str(attrs['latex']) ?? '', true, context.katex, key)
    case 'horizontalRule':
      return <hr key={key} />
    case 'table':
      return table(node, context, key)
    default:
      // An image the parser lifted out of its paragraph, or other inline content at block level, still reads.
      return <Fragment key={key}>{leaf(node, context, key)}</Fragment>
  }
}

function blocks(nodes: JSONContent[] | undefined, context: Context): ReactNode[] {
  return (nodes ?? []).map((node, index) => block(node, context, index))
}

/**
 * A markdown document (Tiptap JSON from @tiptap/markdown) drawn as React elements, as a read-only Tiptap view draws
 * it, without the editor engine: tables, task lists, KaTeX formulas, highlighted code with a copy button.
 */
export function RichText({ doc, katex }: { doc: JSONContent; katex: Katex | null }) {
  return <>{blocks(doc.content, { katex })}</>
}
