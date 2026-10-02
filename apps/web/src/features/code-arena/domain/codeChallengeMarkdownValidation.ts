import type { MarkdownEditorPreset, MarkdownValidationIssue } from '@/features/content-markdown'
import { getMarkdownSaveGate } from '@/features/content-markdown'

export interface CodeChallengeMarkdownIssue {
  /** Catalog key under `Activities.CodeChallenges.markdownField` (UX-285). */
  field: 'problem' | 'inputSpec' | 'outputSpec' | 'visibleTest' | 'hiddenTest' | 'hint'
  /** 1-based test / hint number for the list fields. */
  number?: number
  preset: MarkdownEditorPreset
  issue: MarkdownValidationIssue
}

interface MarkdownValidatedTestCase {
  description?: string | null
}

interface MarkdownValidatedHint {
  content?: string | null
}

export interface MarkdownValidatedCodeChallenge {
  prompt?: string | null
  input_spec?: string | null
  output_spec?: string | null
  visible_tests?: MarkdownValidatedTestCase[] | null
  hidden_tests?: MarkdownValidatedTestCase[] | null
  hints?: MarkdownValidatedHint[] | null
}

export function getCodeChallengeMarkdownIssues(settings: MarkdownValidatedCodeChallenge): CodeChallengeMarkdownIssue[] {
  const issues: CodeChallengeMarkdownIssue[] = []

  collectMarkdownIssues(issues, 'problem', settings.prompt ?? '', 'codeProblemStatement')
  collectMarkdownIssues(issues, 'inputSpec', settings.input_spec ?? '', 'codeInputSpec')
  collectMarkdownIssues(issues, 'outputSpec', settings.output_spec ?? '', 'codeOutputSpec')

  for (const [index, test] of (settings.visible_tests ?? []).entries()) {
    collectMarkdownIssues(issues, 'visibleTest', test.description ?? '', 'codeExampleExplanation', index + 1)
  }

  for (const [index, test] of (settings.hidden_tests ?? []).entries()) {
    collectMarkdownIssues(issues, 'hiddenTest', test.description ?? '', 'codeExampleExplanation', index + 1)
  }

  for (const [index, hint] of (settings.hints ?? []).entries()) {
    collectMarkdownIssues(issues, 'hint', hint.content ?? '', 'codeHint', index + 1)
  }

  return issues
}

export function getFirstBlockingCodeChallengeMarkdownIssue(
  settings: Parameters<typeof getCodeChallengeMarkdownIssues>[0],
): CodeChallengeMarkdownIssue | null {
  return getCodeChallengeMarkdownIssues(settings).find(issue => issue.issue.severity === 'error') ?? null
}

function collectMarkdownIssues(
  target: CodeChallengeMarkdownIssue[],
  field: CodeChallengeMarkdownIssue['field'],
  markdown: string,
  preset: MarkdownEditorPreset,
  number?: number,
) {
  const gate = getMarkdownSaveGate(markdown, preset)
  for (const issue of gate.errors) {
    target.push(number === undefined ? { field, preset, issue } : { field, preset, issue, number })
  }
}
