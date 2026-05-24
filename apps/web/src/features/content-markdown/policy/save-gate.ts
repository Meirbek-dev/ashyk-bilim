import type { MarkdownEditorPreset } from '../presets/presets';
import { validateMarkdownContent } from '../hooks/useMarkdownValidation';
import type { MarkdownValidationIssue } from '../hooks/useMarkdownValidation';

export type MarkdownSaveIntent = 'draft' | 'publish' | 'import';

export interface MarkdownSaveGate {
  intent: MarkdownSaveIntent;
  preset: MarkdownEditorPreset;
  issues: MarkdownValidationIssue[];
  errors: MarkdownValidationIssue[];
  warnings: MarkdownValidationIssue[];
  info: MarkdownValidationIssue[];
  canSave: boolean;
  canPublish: boolean;
  blocking: boolean;
}

export function getMarkdownSaveGate(
  markdown: string,
  preset: MarkdownEditorPreset,
  options: { intent?: MarkdownSaveIntent; required?: boolean } = {},
): MarkdownSaveGate {
  const intent = options.intent ?? 'draft';
  const issues = validateMarkdownContent(markdown, preset, { required: options.required });
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const info = issues.filter((issue) => issue.severity === 'info');
  const blocking = errors.length > 0;

  return {
    intent,
    preset,
    issues,
    errors,
    warnings,
    info,
    blocking,
    canSave: !blocking,
    canPublish: !blocking,
  };
}
