// G-14 content corpus (spec 9): every stored editor document and markdown text goes through the new schema.
// Not part of `gates.ts all` (needs production data). Run: `bun gates/corpus.ts` with DATABASE_URL pointing at a
// restored copy (default: the local restore rehearsal database).
import type { AnyExtension } from '@tiptap/core'

import { isDocument, type EditorNode } from '../src/features/editor/model/document'
import { normalizeDocument } from '../src/features/editor/model/normalize'
import { findLosses, serializeWith } from '../src/features/editor/model/round-trip'
import { contentSchema, discussionSchema } from '../src/features/editor/model/schema'
import { markdownLosses } from '../src/features/markdown/model/round-trip'

type Row = { id: string; source: string; value: unknown }
type Sql = { unsafe: (query: string) => Promise<Row[]>; close: () => Promise<void> }
declare const Bun: { SQL: new (url: string) => Sql }

const url = process.env['DATABASE_URL'] ?? 'postgres://ashyq:ashyq@localhost:5433/ashyq_restore'

const EDITOR_SOURCES: [string, AnyExtension[], string][] = [
  [
    'activities.content',
    contentSchema(),
    `select id::text, 'activities.content' as source, content as value from activities
      where jsonb_typeof(content->'content') = 'array'`,
  ],
  [
    'course_discussions.content',
    discussionSchema(),
    `select id::text, 'course_discussions.content' as source, content as value from course_discussions`,
  ],
]

const text = (table: string, column: string) =>
  `select id::text, '${table}.${column}' as source, ${column} as value from ${table} where coalesce(${column}, '') <> ''`
const itemField = (field: string) =>
  `select id::text, 'assessment_items.body.${field}' as source, body->>'${field}' as value from assessment_items
    where coalesce(body->>'${field}', '') <> ''`

const MARKDOWN_SOURCES = [
  text('courses', 'about'),
  text('courses', 'description'),
  text('chapters', 'description'),
  text('collections', 'description'),
  text('course_updates', 'content'),
  text('assessments', 'description'),
  text('file_submissions', 'instructions'),
  text('grading_entries', 'overall_feedback'),
  ...['prompt', 'explanation', 'input_spec', 'output_spec'].map(itemField),
  `select id::text, 'ai_qa_messages.content' as source, content as value from ai_qa_messages where role = 'assistant'`,
]

type Tally = { total: number; ok: number; issues: string[]; legacy: Map<string, number> }
const tally = (): Tally => ({ total: 0, ok: 0, issues: [], legacy: new Map() })
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

function legacyShapes(node: EditorNode, found: Map<string, number>): void {
  if (node.type === 'blockEmbed' || node.type === 'youtube') bump(found, `node ${node.type}`)
  // D-01 drops these by design; count them so the migration report states what changes.
  if (node.type === 'blockEmbed') {
    if (node.attrs?.['alignment'] && node.attrs['alignment'] !== 'left')
      bump(found, `blockEmbed alignment=${String(node.attrs['alignment'])} (dropped by D-01)`)
    if (typeof node.attrs?.['embedCode'] === 'string' && node.attrs['embedCode'].trim())
      bump(found, 'blockEmbed embedCode (only its iframe src kept by D-01)')
    if (node.attrs?.['embedType'] && node.attrs['embedType'] !== 'url')
      bump(found, `blockEmbed embedType=${String(node.attrs['embedType'])}`)
  }
  for (const child of node.content ?? []) legacyShapes(child, found)
}

function checkEditor(row: Row, extensions: AnyExtension[], into: Tally): void {
  into.total += 1
  const raw = typeof row.value === 'string' && /^\s*\{/.test(row.value) ? JSON.parse(row.value) : row.value
  if (isDocument(raw)) legacyShapes(raw, into.legacy)
  const doc = normalizeDocument(row.value)
  if (typeof doc === 'string') {
    bump(into.legacy, 'legacy HTML string')
    into.ok += 1
    return
  }
  try {
    const losses = findLosses(doc, serializeWith(extensions)(doc))
    if (losses.length === 0) into.ok += 1
    else into.issues.push(`${row.source} ${row.id}: ${losses.map(loss => `${loss.path} ${loss.what}`).join('; ')}`)
  } catch (error) {
    into.issues.push(`${row.source} ${row.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function checkMarkdown(row: Row, into: Tally): void {
  into.total += 1
  const source = String(row.value)
  const { losses, rawHtml } = markdownLosses(source)
  if (rawHtml) bump(into.legacy, `raw HTML (${row.source})`)
  if (losses.length === 0) into.ok += 1
  else into.issues.push(`${row.source} ${row.id}: ${losses.slice(0, 3).join('; ')}`)
}

function report(title: string, result: Tally): void {
  const lines = [
    `\n${title}: total ${result.total}, ok ${result.ok}, with losses ${result.issues.length}`,
    ...[...result.legacy].map(([shape, count]) => `  legacy shape: ${shape} x${count}`),
    ...result.issues.slice(0, 20).map(issue => `  ${issue.slice(0, 300)}`),
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
}

const sql = new Bun.SQL(url)
const editor = tally()
for (const [, extensions, query] of EDITOR_SOURCES)
  for (const row of await sql.unsafe(query)) checkEditor(row, extensions, editor)
const markdown = tally()
for (const query of MARKDOWN_SOURCES) for (const row of await sql.unsafe(query)) checkMarkdown(row, markdown)
await sql.close()

report('G-14 editor documents', editor)
report('G-14 markdown texts', markdown)
process.exitCode = editor.issues.length + markdown.issues.length > 0 ? 1 : 0
