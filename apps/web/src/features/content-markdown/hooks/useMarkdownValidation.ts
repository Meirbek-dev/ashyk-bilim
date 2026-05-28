import type { MarkdownEditorPreset } from '../presets/presets'
import { getMarkdownPreset } from '../presets/presets'
import {
  findUnsafeMarkdownLinks,
  hasRawHtml,
  isMarkdownStructurallyEmpty,
} from '../utils/markdown-sanitize'

export interface MarkdownValidationIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

function hasUnbalancedMathDelimiters(markdown: string): boolean {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  let inlineOpen = false
  let blockOpen = false

  for (let i = 0; i < withoutCode.length; i += 1) {
    const char = withoutCode[i]
    if (char !== '$') continue
    if (i > 0 && withoutCode[i - 1] === '\\') continue

    const next = withoutCode[i + 1]
    const prev = withoutCode[i - 1]
    if (next === '$') {
      blockOpen = !blockOpen
      i += 1
      continue
    }

    const opening = !inlineOpen
    if (opening) {
      if (!next || /\s|\d/.test(next)) continue
    } else if (!prev || /\s/.test(prev)) {
      continue
    }
    inlineOpen = !inlineOpen
  }

  return inlineOpen || blockOpen
}

/**
 * Validates markdown content against a preset's constraints.
 * Returns all issues, not just the first.
 */
export function validateMarkdownContent(
  markdown: string,
  preset: MarkdownEditorPreset,
  options: { required?: boolean } = {},
): MarkdownValidationIssue[] {
  const config = getMarkdownPreset(preset)
  const issues: MarkdownValidationIssue[] = []

  // ── Required field ────────────────────────────────────────────────────────
  if (options.required && isMarkdownStructurallyEmpty(markdown)) {
    issues.push({
      severity: 'error',
      code: 'content.empty',
      message: 'Content is required.',
    })
  }

  // ── Length check ──────────────────────────────────────────────────────────
  const overBy = markdown.length - config.maxLength
  if (overBy > 0) {
    issues.push({
      severity: 'error',
      code: 'content.tooLong',
      message: `Content is ${overBy} characters over the limit.`,
    })
  } else if (markdown.length > config.maxLength * 0.9) {
    issues.push({
      severity: 'warning',
      code: 'content.nearLimit',
      message: `Content is approaching the character limit.`,
    })
  }

  // ── Security checks ───────────────────────────────────────────────────────
  if (hasRawHtml(markdown)) {
    issues.push({
      severity: 'error',
      code: 'html.raw',
      message: 'Raw HTML is not supported.',
    })
  }

  const unsafeLinks = findUnsafeMarkdownLinks(markdown)
  if (unsafeLinks.length > 0) {
    issues.push({
      severity: 'error',
      code: 'link.unsafe',
      message: 'One or more links use an unsafe protocol.',
    })
  }

  // ── Structure checks ─────────────────────────────────────────────────────
  // Count triple-backtick fences that are NOT inside code spans (simplified: count ```)
  // Strip inline code spans first so embedded backticks don't count
  const withoutInlineCode = markdown.replace(/`[^`\n]+`/g, '')
  const fenceCount = withoutInlineCode.match(/```/g)?.length ?? 0
  if (fenceCount % 2 !== 0) {
    issues.push({
      severity: 'warning',
      code: 'codeFence.unclosed',
      message: 'A code block appears to be missing a closing fence.',
    })
  }

  // ── Math checks ───────────────────────────────────────────────────────────
  if (config.allowMath) {
    if (hasUnbalancedMathDelimiters(markdown)) {
      issues.push({
        severity: 'warning',
        code: 'math.unbalanced',
        message: 'A math expression appears to have an unbalanced $ delimiter.',
      })
    }
  }

  // ── Table structure check ─────────────────────────────────────────────────
  if (config.allowTable) {
    const tableLines = markdown.split('\n').filter(l => l.includes('|'))
    let lastColCount = -1
    for (const line of tableLines) {
      const cols = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).length
      if (lastColCount > 0 && cols > 0 && cols !== lastColCount) {
        issues.push({
          severity: 'warning',
          code: 'table.columnMismatch',
          message: 'A table appears to have rows with different column counts.',
        })
        break
      }
      if (cols > 0) lastColCount = cols
    }
  }

  return issues
}

export function getHighestMarkdownIssueSeverity(
  issues: MarkdownValidationIssue[],
): MarkdownValidationIssue['severity'] | null {
  if (issues.some(issue => issue.severity === 'error')) return 'error'
  if (issues.some(issue => issue.severity === 'warning')) return 'warning'
  if (issues.some(issue => issue.severity === 'info')) return 'info'
  return null
}
