import { Fragment, type ReactNode } from 'react'

import type { EditorNode } from '../../model/document'
import { linkHref } from '../../model/link'

type Mark = NonNullable<EditorNode['marks']>[number]

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** Tiptap's link mark: the configured target/rel unless stored, and no href when the schema would refuse it. */
function markElement(mark: Mark, children: ReactNode): ReactNode {
  const attrs = mark.attrs ?? {}
  switch (mark.type) {
    case 'bold':
      return <strong>{children}</strong>
    case 'italic':
      return <em>{children}</em>
    case 'strike':
      return <s>{children}</s>
    case 'underline':
      return <u>{children}</u>
    case 'code':
      return <code>{children}</code>
    case 'link': {
      const href = str(attrs['href']) ?? ''
      return (
        <a
          href={linkHref(href) === href.trim() ? href : ''}
          target={str(attrs['target']) ?? '_blank'}
          rel={str(attrs['rel']) ?? 'noopener noreferrer'}
          className={str(attrs['class'])}
          title={str(attrs['title'])}
        >
          {children}
        </a>
      )
    }
    default:
      return children
  }
}

// The schema's mark order (link has Tiptap priority 1000, the rest follow StarterKit): ProseMirror nests by it.
const RANK = ['link', 'bold', 'code', 'italic', 'strike', 'underline']
const rank = (mark: Mark) => (RANK.includes(mark.type) ? RANK.indexOf(mark.type) : RANK.length)
const byRank = (a: Mark, b: Mark) => rank(a) - rank(b)

const sameMark = (a: Mark, b: Mark | undefined) =>
  b !== undefined && a.type === b.type && JSON.stringify(a.attrs) === JSON.stringify(b.attrs)

function grouped(nodes: EditorNode[], depth: number): ReactNode[] {
  const out: ReactNode[] = []
  let start = 0
  while (start < nodes.length) {
    const mark = nodes[start]?.marks?.[depth]
    const stop = mark ? nodes.findIndex((node, index) => index > start && !sameMark(mark, node.marks?.[depth])) : -1
    const end = mark ? (stop === -1 ? nodes.length : stop) : start + 1
    const group = nodes.slice(start, end)
    if (mark) out.push(<Fragment key={start}>{markElement(mark, grouped(group, depth + 1))}</Fragment>)
    else out.push(nodes[start]?.type === 'hardBreak' ? <br key={start} /> : (nodes[start]?.text ?? null))
    start = end
  }
  return out
}

/** Inline content as ProseMirror draws it: neighbours sharing a mark share one element (one link, not two). */
export function inline(nodes: EditorNode[]): ReactNode[] {
  return grouped(
    nodes.map(node => (node.marks ? { ...node, marks: node.marks.toSorted(byRank) } : node)),
    0,
  )
}

/** A textblock's content plus ProseMirror's trailing break: an empty block, or one ending in a break, keeps its line. */
export function textblock(node: EditorNode): ReactNode[] {
  const content = node.content ?? []
  return content.at(-1)?.type === 'text' ? inline(content) : [...inline(content), <br key="trailing" />]
}
