import type { MarkdownEditorPreset, MarkdownValidationIssue } from '@/features/content-markdown';
import { getMarkdownSaveGate } from '@/features/content-markdown';

export interface CodeChallengeMarkdownIssue {
  field: string;
  preset: MarkdownEditorPreset;
  issue: MarkdownValidationIssue;
}

interface MarkdownValidatedTestCase {
  description?: string | null;
}

interface MarkdownValidatedHint {
  content?: string | null;
}

export interface MarkdownValidatedCodeChallenge {
  prompt?: string | null;
  input_spec?: string | null;
  output_spec?: string | null;
  visible_tests?: MarkdownValidatedTestCase[] | null;
  hidden_tests?: MarkdownValidatedTestCase[] | null;
  hints?: MarkdownValidatedHint[] | null;
}

export function getCodeChallengeMarkdownIssues(
  settings: MarkdownValidatedCodeChallenge,
): CodeChallengeMarkdownIssue[] {
  const issues: CodeChallengeMarkdownIssue[] = [];

  collectMarkdownIssues(issues, 'Problem statement', settings.prompt ?? '', 'codeProblemStatement');
  collectMarkdownIssues(issues, 'Input specification', settings.input_spec ?? '', 'codeInputSpec');
  collectMarkdownIssues(issues, 'Output specification', settings.output_spec ?? '', 'codeOutputSpec');

  for (const [index, test] of (settings.visible_tests ?? []).entries()) {
    collectMarkdownIssues(
      issues,
      `Visible test ${index + 1} description`,
      test.description ?? '',
      'codeExampleExplanation',
    );
  }

  for (const [index, test] of (settings.hidden_tests ?? []).entries()) {
    collectMarkdownIssues(
      issues,
      `Hidden test ${index + 1} description`,
      test.description ?? '',
      'codeExampleExplanation',
    );
  }

  for (const [index, hint] of (settings.hints ?? []).entries()) {
    collectMarkdownIssues(issues, `Hint ${index + 1}`, hint.content ?? '', 'codeHint');
  }

  return issues;
}

export function getFirstBlockingCodeChallengeMarkdownIssue(
  settings: Parameters<typeof getCodeChallengeMarkdownIssues>[0],
): CodeChallengeMarkdownIssue | null {
  return getCodeChallengeMarkdownIssues(settings).find((issue) => issue.issue.severity === 'error') ?? null;
}

function collectMarkdownIssues(
  target: CodeChallengeMarkdownIssue[],
  field: string,
  markdown: string,
  preset: MarkdownEditorPreset,
) {
  const gate = getMarkdownSaveGate(markdown, preset);
  target.push(...gate.errors.map((issue) => ({ field, preset, issue })));
}
