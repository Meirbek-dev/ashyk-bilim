import type { CSSProperties, ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import { isRecord, type EditorDocument, type EditorNode } from '../../model/document'
import { BLOCK_ATTRS } from '../../model/schema/attrs'
import type { ViewProps } from '../nodes/parts'
import { DISCUSSION_VIEWS, VIEWS, type BlockView } from '../views'
import { CodeBlock } from './code-block'
import { NodeChildren } from './content'
import { inline, textblock } from './inline'

type Surface = { views: Record<string, BlockView>; tables: boolean; images: boolean }

const LESSON: Surface = { views: VIEWS, tables: true, images: false }
// A post: rich text, images and embeds (the post schema); lesson blocks are not part of it.
const POST: Surface = { views: DISCUSSION_VIEWS, tables: false, images: true }

// ProseMirror's own editor styles that shape text: kept spaces, no ligatures.
const PROSEMIRROR = 'ab-prose-static'
const DEFAULTS: Record<string, Record<string, unknown>> = BLOCK_ATTRS
const READ_ONLY: ViewProps['editor'] = { isEditable: false }
const keep = () => undefined

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const dim = (value: unknown): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined
const ALIGNS = ['left', 'center', 'right'] as const
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
const LIST_TYPES = ['1', 'a', 'A', 'i', 'I'] as const
const listType = (value: unknown) => LIST_TYPES.find(type => type === value)
const num = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

/** Tiptap's table view (not resizable when read): a wrapper, the column widths, the rows. */
function table(node: EditorNode, surface: Surface, key: number) {
  const cols: number[] = []
  let total = 0
  let fixed = true
  for (const cell of node.content?.[0]?.content ?? []) {
    const stored: unknown = cell.attrs?.['colwidth']
    const widths: unknown[] = Array.isArray(stored) ? stored : []
    for (let index = 0; index < num(cell.attrs?.['colspan'], 1); index += 1) {
      const value = widths[index]
      const width = typeof value === 'number' && value > 0 ? value : 0
      total += width || 25
      if (!width) fixed = false
      cols.push(width)
    }
  }
  return (
    <div key={key} className="tableWrapper">
      <table
        className={fixed ? 'w-(--table-width)' : 'min-w-(--table-width)'}
        style={{ '--table-width': `${total}px` } as CSSProperties & { '--table-width': string }}
      >
        <colgroup>
          {cols.map((width, index) => (
            <col
              key={index}
              className={width ? 'w-(--column-width)' : 'min-w-(--column-width)'}
              style={{ '--column-width': `${Math.max(width, 25)}px` } as CSSProperties & { '--column-width': string }}
            />
          ))}
        </colgroup>
        <tbody>{blocks(node.content, surface)}</tbody>
      </table>
    </div>
  )
}

function tableCell(node: EditorNode, surface: Surface, key: number) {
  const Tag = node.type === 'tableHeader' ? 'th' : 'td'
  const colSpan = num(node.attrs?.['colspan'], 1)
  const rowSpan = num(node.attrs?.['rowspan'], 1)
  const textAlign = ALIGNS.find(align => align === node.attrs?.['align'])
  return (
    <Tag
      key={key}
      colSpan={colSpan === 1 ? undefined : colSpan}
      rowSpan={rowSpan === 1 ? undefined : rowSpan}
      className={
        textAlign === 'center'
          ? 'text-center'
          : textAlign === 'right'
            ? 'text-right'
            : textAlign === 'left'
              ? 'text-left'
              : undefined
      }
    >
      {blocks(node.content, surface)}
    </Tag>
  )
}

/** A custom block through its view, inside the element Tiptap's ReactNodeViewRenderer mounts views in. */
function block(node: EditorNode, view: BlockView, surface: Surface, key: number) {
  const name = node.type ?? ''
  const defaults = DEFAULTS[name] ?? {}
  const stored = isRecord(node.attrs) ? node.attrs : {}
  const attrs = Object.fromEntries(
    Object.entries(defaults).map(([attr, value]) => [attr, Object.hasOwn(stored, attr) ? stored[attr] : value]),
  )
  const [View, tag] = view
  return (
    <div key={key} className={`react-renderer node-${name}`}>
      <NodeChildren value={tag === 'span' ? inline(node.content ?? []) : blocks(node.content, surface)}>
        <View node={{ attrs, type: { name } }} editor={READ_ONLY} selected={false} updateAttributes={keep} />
      </NodeChildren>
    </div>
  )
}

function render(node: EditorNode, surface: Surface, key: number): ReactNode {
  const attrs = node.attrs ?? {}
  const view = node.type ? surface.views[node.type] : undefined
  if (view) return block(node, view, surface, key)
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{textblock(node)}</p>
    case 'heading': {
      const level = num(attrs['level'], 1)
      const Tag = HEADINGS[level - 1] ?? 'h1'
      return (
        <Tag key={key} id={str(attrs['id'])}>
          {textblock(node)}
        </Tag>
      )
    }
    case 'blockquote':
      return <blockquote key={key}>{blocks(node.content, surface)}</blockquote>
    case 'bulletList':
      return <ul key={key}>{blocks(node.content, surface)}</ul>
    case 'orderedList': {
      const start = num(attrs['start'], 1)
      return (
        <ol key={key} start={start === 1 ? undefined : start} type={listType(attrs['type'])}>
          {blocks(node.content, surface)}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{blocks(node.content, surface)}</li>
    case 'horizontalRule':
      return <hr key={key} />
    case 'codeBlock':
      return (
        <CodeBlock
          key={key}
          language={str(attrs['language'])}
          text={(node.content ?? []).map(child => child.text ?? '').join('')}
        />
      )
    case 'table':
      return surface.tables ? table(node, surface, key) : null
    case 'tableRow':
      return surface.tables ? (
        <tr key={key}>{node.content?.map((child, index) => tableCell(child, surface, index))}</tr>
      ) : null
    case 'image':
      return surface.images ? (
        <img
          key={key}
          src={str(attrs['src'])}
          alt={str(attrs['alt'])}
          title={str(attrs['title'])}
          width={dim(attrs['width'])}
          height={dim(attrs['height'])}
        />
      ) : null
    default:
      // Not in this surface's schema: the editor would have refused the whole document; the rest still reads.
      return null
  }
}

function blocks(nodes: EditorNode[] | undefined, surface: Surface): ReactNode[] {
  return (nodes ?? []).map((node, index) => render(node, surface, index))
}

/**
 * A stored document drawn without the editor (B-EDT-34): the same elements, classes and white-space rules Tiptap's
 * read-only view produces, and the same block views, so a lesson looks identical while ~140 KB gzip of editor
 * code stays off the page. `discussion`: a post, read with the post schema.
 */
export function StaticDocument({ doc, discussion = false }: { doc: EditorDocument; discussion?: boolean }) {
  return (
    <article aria-label={m.editor_label()} className={`ab-prose relative max-w-none ${PROSEMIRROR}`}>
      {blocks(doc.content, discussion ? POST : LESSON)}
    </article>
  )
}
