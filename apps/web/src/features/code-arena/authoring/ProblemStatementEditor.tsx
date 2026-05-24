'use client';

import { FileText, Eye, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/features/assessments/shared/MarkdownRenderer';
import type { CodeChallengeSettings } from '@/services/courses/code-challenges';

interface ProblemStatementEditorProps {
  draft: CodeChallengeSettings;
  onChange: (patch: Partial<CodeChallengeSettings>) => void;
}

export function ProblemStatementEditor({ draft, onChange }: ProblemStatementEditorProps) {
  const [isPreview, setIsPreview] = useState(false);

  const constraintsList = draft.constraints ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Editor Sub-Header */}
      <div className="bg-muted/20 flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Problem Configuration
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setIsPreview(false)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
              !isPreview
                ? 'bg-secondary text-secondary-foreground border-border'
                : 'text-muted-foreground border-transparent bg-transparent'
            }`}
          >
            <FileText className="mr-1 inline size-3.5" />
            Editor
          </button>
          <button
            type="button"
            onClick={() => setIsPreview(true)}
            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
              isPreview
                ? 'bg-secondary text-secondary-foreground border-border'
                : 'text-muted-foreground border-transparent bg-transparent'
            }`}
          >
            <Eye className="mr-1 inline size-3.5" />
            Live Student Preview
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!isPreview ? (
          /* Markdown Input Form Panel */
          <div className="mx-auto max-w-4xl space-y-6 p-6">
            <div className="grid gap-4 md:grid-cols-[1fr_160px_160px]">
              <label className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-semibold uppercase">Challenge Title</span>
                <Input
                  value={draft.title ?? ''}
                  onChange={(e) => onChange({ title: e.target.value })}
                  placeholder="e.g. Two Sum"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-semibold uppercase">Difficulty</span>
                <NativeSelect
                  value={draft.difficulty ?? 'EASY'}
                  onChange={(e) => onChange({ difficulty: e.target.value as any })}
                >
                  <NativeSelectOption value="EASY">Easy</NativeSelectOption>
                  <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
                  <NativeSelectOption value="HARD">Hard</NativeSelectOption>
                </NativeSelect>
              </label>

              <label className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-semibold uppercase">Max Score (Pts)</span>
                <Input
                  type="number"
                  min={1}
                  value={draft.points ?? 100}
                  onChange={(e) => onChange({ points: Number(e.target.value) })}
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs font-semibold uppercase">
                Problem Description (Markdown)
              </span>
              <Textarea
                value={draft.prompt ?? ''}
                onChange={(e) => onChange({ prompt: e.target.value })}
                className="min-h-56 font-mono text-sm leading-relaxed"
                placeholder="Write the task description here. You can use markdown and math equations."
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-semibold uppercase">
                  Input Specification (Markdown)
                </span>
                <Textarea
                  value={draft.input_spec ?? ''}
                  onChange={(e) => onChange({ input_spec: e.target.value })}
                  className="min-h-24 font-mono text-sm"
                  placeholder="Describe inputs structure..."
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-muted-foreground text-xs font-semibold uppercase">
                  Output Specification (Markdown)
                </span>
                <Textarea
                  value={draft.output_spec ?? ''}
                  onChange={(e) => onChange({ output_spec: e.target.value })}
                  className="min-h-24 font-mono text-sm"
                  placeholder="Describe outputs structure..."
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs font-semibold uppercase">Constraints (One per line)</span>
              <Textarea
                value={constraintsList.join('\n')}
                onChange={(e) =>
                  onChange({
                    constraints: e.target.value
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean),
                  })
                }
                className="min-h-24 font-mono text-sm"
                placeholder="1 <= nums.length <= 10^4&#10;-10^9 <= nums[i] <= 10^9"
              />
            </label>
          </div>
        ) : (
          /* Live Render Preview Panel */
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            <header className="space-y-2.5 border-b pb-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    draft.difficulty === 'EASY' ? 'success' : draft.difficulty === 'MEDIUM' ? 'warning' : 'destructive'
                  }
                >
                  {draft.difficulty ?? 'EASY'}
                </Badge>
                <Badge variant="outline">{draft.points ?? 100} pts</Badge>
                {draft.time_limit && <Badge variant="secondary">{draft.time_limit}s limit</Badge>}
              </div>
              <h1 className="text-2xl font-bold tracking-normal">{draft.title || 'Untitled Challenge'}</h1>
            </header>

            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={draft.prompt || '*No problem statement written yet.*'} />
            </div>

            {draft.input_spec && (
              <div className="space-y-1">
                <h3 className="text-foreground text-sm font-bold">Input Format</h3>
                <MarkdownRenderer
                  content={draft.input_spec}
                  compact
                />
              </div>
            )}

            {draft.output_spec && (
              <div className="space-y-1">
                <h3 className="text-foreground text-sm font-bold">Output Format</h3>
                <MarkdownRenderer
                  content={draft.output_spec}
                  compact
                />
              </div>
            )}

            {constraintsList.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-foreground text-sm font-bold">Constraints</h3>
                <ul className="space-y-1.5">
                  {constraintsList.map((constraint, idx) => (
                    <li
                      key={`preview-const-${idx}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono">{constraint}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
