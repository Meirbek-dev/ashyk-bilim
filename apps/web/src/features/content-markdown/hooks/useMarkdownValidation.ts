import type { MarkdownEditorPreset } from '../presets/presets'
import { MARKDOWN_PRESETS } from '../presets/presets'
import { findUnsafeMarkdownLinks, hasRawHtml, isMarkdownStructurallyEmpty } from '../utils/markdown-sanitize'

export interface MarkdownValidationIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

function hasUnbalancedMathDelimiters(markdown: string): boolean {
  // Удаляем блоки кода, чтобы не учитывать находящиеся там символы
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  let inlineOpen = false
  let blockOpen = false

  for (let i = 0; i < withoutCode.length; i += 1) {
    const char = withoutCode[i]
    if (char === '$' && (i === 0 || withoutCode[i - 1] !== '\\')) {
      const next = withoutCode[i + 1]
      if (next === '$') {
        blockOpen = !blockOpen
        i += 1
      } else {
        const prev = withoutCode[i - 1]
        const opening = !inlineOpen
        if (opening) {
          if (next && !/\s|\d/.test(next)) {
            inlineOpen = !inlineOpen
          }
        } else if (prev && !/\s/.test(prev)) {
          inlineOpen = !inlineOpen
        }
      }
    }
  }

  return inlineOpen || blockOpen
}

/**
 * Проверяет Markdown-контент на соответствие ограничениям пресета.
 * Возвращает все обнаруженные проблемы, а не только первую.
 */
export function validateMarkdownContent(
  markdown: string,
  preset: MarkdownEditorPreset,
  options: { required?: boolean } = {},
): MarkdownValidationIssue[] {
  const config = MARKDOWN_PRESETS[preset]
  const issues: MarkdownValidationIssue[] = []

  // ── Обязательное поле ──────────────────────────────────────────────────────
  if (options.required && isMarkdownStructurallyEmpty(markdown)) {
    issues.push({
      severity: 'error',
      code: 'content.empty',
      message: 'Содержание не может быть пустым.',
    })
  }

  // ── Проверка длины ─────────────────────────────────────────────────────────
  const overBy = markdown.length - config.maxLength
  if (overBy > 0) {
    issues.push({
      severity: 'error',
      code: 'content.tooLong',
      message: `Превышен лимит символов. Удалите лишние символы: ${overBy}.`,
    })
  } else if (markdown.length > config.maxLength * 0.9) {
    issues.push({
      severity: 'warning',
      code: 'content.nearLimit',
      message: `Длина текста приближается к установленному лимиту.`,
    })
  }

  // ── Проверки безопасности ──────────────────────────────────────────────────
  if (hasRawHtml(markdown)) {
    issues.push({
      severity: 'error',
      code: 'html.raw',
      message: 'Прямая вставка HTML (Raw HTML) не поддерживается.',
    })
  }

  const unsafeLinks = findUnsafeMarkdownLinks(markdown)
  if (unsafeLinks.length > 0) {
    issues.push({
      severity: 'error',
      code: 'link.unsafe',
      message: 'Одна или несколько ссылок используют небезопасный протокол.',
    })
  }

  // ── Проверки структуры ────────────────────────────────────────────────────
  // Считаем тройные обратные кавычки, которые НЕ находятся внутри инлайнового кода
  // (сначала удаляем инлайновые блоки, чтобы их кавычки не искажали результат)
  const withoutInlineCode = markdown.replace(/`[^`\n]+`/g, '')
  const fenceCount = withoutInlineCode.match(/```/g)?.length ?? 0
  if (fenceCount % 2 !== 0) {
    issues.push({
      severity: 'warning',
      code: 'codeFence.unclosed',
      message: 'Похоже, в блоке кода пропущена закрывающая конструкция (```).',
    })
  }

  // ── Проверки математических выражений ──────────────────────────────────────
  if (config.allowMath) {
    if (hasUnbalancedMathDelimiters(markdown)) {
      issues.push({
        severity: 'warning',
        code: 'math.unbalanced',
        message: 'Похоже, в математическом выражении не сбалансирован разделитель $.',
      })
    }
  }

  // ── Проверка структуры таблиц ──────────────────────────────────────────────
  if (config.allowTable) {
    const tableLines = markdown.split('\n').filter(l => l.includes('|'))
    let lastColCount = -1
    for (const line of tableLines) {
      const cols = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).length
      if (lastColCount > 0 && cols > 0 && cols !== lastColCount) {
        issues.push({
          severity: 'warning',
          code: 'table.columnMismatch',
          message: 'Похоже, в таблице есть строки с разным количеством колонок.',
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
