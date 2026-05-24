'use client';

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import type { CodeChallengeSettings } from '@/services/courses/code-challenges';
import { cn } from '@/lib/utils';

interface PublishReadinessPanelProps {
  draft: CodeChallengeSettings;
}

export function PublishReadinessPanel({ draft }: PublishReadinessPanelProps) {
  const readiness = useMemo(() => buildReadiness(draft), [draft]);
  const blockersCount = readiness.items.filter((item) => !item.ok).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="bg-muted/20 flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Publish Readiness Check
        </span>
        <Badge
          variant={blockersCount > 0 ? 'warning' : 'success'}
          className="text-[10px] font-bold"
        >
          {blockersCount > 0 ? `${blockersCount} Issues Pending` : 'Ready to Publish'}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          <div className="bg-card space-y-3 rounded-lg border p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {blockersCount > 0 ? (
                <AlertTriangle className="size-5 animate-bounce fill-amber-500/10 text-amber-500" />
              ) : (
                <CheckCircle2 className="size-5 fill-emerald-600/10 text-emerald-600" />
              )}
              {blockersCount > 0 ? 'Checklist pending requirements' : 'All publish readiness requirements have passed!'}
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Before publishing this challenge to students, verify that all configurations meet grading requirements. An
              incomplete challenge cannot be evaluated.
            </p>
          </div>

          <div className="grid gap-3">
            {readiness.items.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 transition-all duration-200',
                  item.ok ? 'border-emerald-500/10 bg-emerald-500/[0.01]' : 'border-amber-500/25 bg-amber-500/[0.01]',
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {item.ok ? (
                    <CheckCircle2 className="size-5 fill-emerald-600/10 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="size-5 fill-amber-500/10 text-amber-500" />
                  )}
                </div>
                <div className="space-y-1">
                  <h4
                    className={cn(
                      'text-sm font-semibold',
                      item.ok ? 'text-foreground' : 'text-amber-800 dark:text-amber-300',
                    )}
                  >
                    {item.label}
                  </h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildReadiness(settings: CodeChallengeSettings) {
  const visible = settings.visible_tests ?? [];
  const hidden = settings.hidden_tests ?? [];
  const referenceSolutions = settings.reference_solutions ?? {};
  const starterCode = settings.starter_code ?? {};

  const items = [
    {
      label: 'Problem Statement & Title',
      ok: Boolean((settings.prompt ?? '').trim() && (settings.title ?? '').trim()),
      detail: 'A non-empty challenge title and description prompt in markdown format are required.',
    },
    {
      label: 'Allowed Languages & Code Harnesses',
      ok:
        (settings.allowed_languages ?? []).length > 0 &&
        settings.allowed_languages.every((id) => starterCode[id]?.trim() && referenceSolutions[id]?.trim()),
      detail:
        'Configure allowed languages and verify starter code templates and reference solutions exist for every language.',
    },
    {
      label: 'Visible Samples',
      ok: visible.length > 0 && visible.some((test) => test.input.trim() || test.expected_output.trim()),
      detail: 'Provide at least one visible test case sample so students can verify standard outputs locally.',
    },
    {
      label: 'Hidden Grading Tests',
      ok: hidden.length > 0,
      detail:
        'Provide at least one hidden grading test case. Hidden cases ensure submissions cannot simply hardcode expected sample outputs.',
    },
    {
      label: 'Execution Limits & Thresholds',
      ok: Boolean(settings.time_limit && settings.memory_limit),
      detail:
        'Specify execution time limits (seconds) and memory usage limits (MB) to prevent infinite loops and resource exhaustions.',
    },
  ];
  return {
    items,
  };
}
