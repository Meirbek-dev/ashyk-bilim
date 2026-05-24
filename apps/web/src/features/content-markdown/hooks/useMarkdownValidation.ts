import type { MarkdownEditorPreset } from '../presets/presets';
import { getMarkdownPreset } from '../presets/presets';
import { findUnsafeMarkdownLinks, hasRawHtml, isMarkdownStructurallyEmpty } from '../utils/markdown-sanitize';

export interface MarkdownValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export function validateMarkdownContent(
  markdown: string,
  preset: MarkdownEditorPreset,
  options: { required?: boolean } = {},
): MarkdownValidationIssue[] {
  const config = getMarkdownPreset(preset);
  const issues: MarkdownValidationIssue[] = [];

  if (options.required && isMarkdownStructurallyEmpty(markdown)) {
    issues.push({
      severity: 'error',
      code: 'content.empty',
      message: 'Content is required.',
    });
  }

  if (markdown.length > config.maxLength) {
    issues.push({
      severity: 'error',
      code: 'content.tooLong',
      message: `Content is ${markdown.length - config.maxLength} characters over the limit.`,
    });
  }

  if (hasRawHtml(markdown)) {
    issues.push({
      severity: 'error',
      code: 'html.raw',
      message: 'Raw HTML is not supported.',
    });
  }

  const unsafeLinks = findUnsafeMarkdownLinks(markdown);
  if (unsafeLinks.length > 0) {
    issues.push({
      severity: 'error',
      code: 'link.unsafe',
      message: 'One or more links use an unsafe protocol.',
    });
  }

  if ((markdown.match(/```/g)?.length ?? 0) % 2 !== 0) {
    issues.push({
      severity: 'warning',
      code: 'codeFence.unclosed',
      message: 'A code block appears to be missing a closing fence.',
    });
  }

  const dollarCount = markdown.match(/(?<!\\)\$/g)?.length ?? 0;
  if (config.allowMath && dollarCount % 2 !== 0) {
    issues.push({
      severity: 'warning',
      code: 'math.unbalanced',
      message: 'A math expression appears to have an unbalanced $ delimiter.',
    });
  }

  return issues;
}

export function getHighestMarkdownIssueSeverity(
  issues: MarkdownValidationIssue[],
): MarkdownValidationIssue['severity'] | null {
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  if (issues.some((issue) => issue.severity === 'info')) return 'info';
  return null;
}
