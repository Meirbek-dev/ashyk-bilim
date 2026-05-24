'use client';

import { Play, CheckCircle2, XCircle, Loader2, Code2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import type { CodeChallengeSettings, Judge0Language } from '@/services/courses/code-challenges';
import { cn } from '@/lib/utils';

interface ReferenceSolutionRunnerProps {
  draft: CodeChallengeSettings;
  languages: Judge0Language[];
}

interface ValidationResultDetail {
  test_id: string;
  passed: boolean;
  status_description: string;
  time?: number;
  memory?: number;
}

interface ValidationResultLanguage {
  ok: boolean;
  status: string;
  passed?: number;
  total?: number;
  score?: number;
  compile_output?: string;
  message?: string;
  details?: ValidationResultDetail[];
}

export function ReferenceSolutionRunner({ draft, languages }: ReferenceSolutionRunnerProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<Record<number, ValidationResultLanguage> | null>(null);

  const selectedLanguages = draft.allowed_languages
    .map((id) => languages.find((lang) => lang.id === id))
    .filter(Boolean) as Judge0Language[];

  const runValidation = async () => {
    if (selectedLanguages.length === 0) {
      toast.error('Configure allowed languages first.');
      return;
    }
    setIsValidating(true);
    setResults(null);
    try {
      const response = await apiFetch(`assessments/${draft.uuid}/code-challenge/validate`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Validation endpoint failed.');
      }
      const data = await response.json();
      setResults(data.results);
      toast.success('Reference solution validation finished.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to validate reference solutions.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Runner Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4 bg-muted/20">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Reference Verification Suite
        </span>
        <Button
          type="button"
          size="xs"
          onClick={runValidation}
          disabled={isValidating || selectedLanguages.length === 0}
          className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isValidating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Validate Solutions
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-4xl mx-auto p-6 space-y-5">
          {selectedLanguages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground text-sm">
              <Code2 className="size-8 text-muted-foreground/30 mb-2" />
              Please select at least one language in the "Languages" tab before validation.
            </div>
          ) : (
            <div className="space-y-4">
              {selectedLanguages.map((lang) => {
                const starter = draft.starter_code?.[lang.id];
                const solution = draft.reference_solutions?.[lang.id];
                const runResult = results?.[lang.id];

                return (
                  <div key={lang.id} className="rounded-lg border bg-card text-card-foreground shadow-xs">
                    <div className="flex items-center justify-between border-b p-4">
                      <div className="flex items-center gap-2.5">
                        <Code2 className="size-5 text-emerald-600" />
                        <div>
                          <h3 className="text-sm font-semibold">{lang.name}</h3>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 font-medium">
                            <span className="flex items-center gap-1">
                              Starter code: {starter?.trim() ? '✓ Present' : '✗ Missing'}
                            </span>
                            <span className="flex items-center gap-1">
                              Solution: {solution?.trim() ? '✓ Present' : '✗ Missing'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {runResult ? (
                          <div className="flex items-center gap-2">
                            {runResult.ok ? (
                              <Badge variant="success" className="gap-1 font-bold text-[10px]">
                                <CheckCircle2 className="size-3" />
                                Passes Tests
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 font-bold text-[10px]">
                                <XCircle className="size-3" />
                                {runResult.status}
                              </Badge>
                            )}
                            {typeof runResult.passed === 'number' && (
                              <span className="text-xs font-semibold text-muted-foreground font-mono">
                                {runResult.passed}/{runResult.total}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="font-bold text-[10px]">
                            Awaiting Run
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Result outputs details */}
                    {runResult && (
                      <div className="p-4 bg-muted/5 border-t space-y-3">
                        {runResult.compile_output && (
                          <div className="space-y-1.5">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Compilation Diagnostic</h4>
                            <pre className="bg-rose-500/10 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300 border border-rose-500/20 rounded p-3 font-mono text-xs overflow-x-auto">
                              {runResult.compile_output}
                            </pre>
                          </div>
                        )}

                        {runResult.message && (
                          <div className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Error Details</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">{runResult.message}</p>
                          </div>
                        )}

                        {runResult.details && runResult.details.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Execution cases breakdown</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                              {runResult.details.map((caseDetail, idx) => (
                                <div
                                  key={`case-detail-${lang.id}-${idx}`}
                                  className={cn(
                                    'rounded border p-2 text-center text-xs transition-colors duration-150',
                                    caseDetail.passed
                                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300'
                                  )}
                                >
                                  <div className="font-bold mb-0.5 truncate" title={caseDetail.test_id}>
                                    Case {idx + 1}
                                  </div>
                                  <div className="text-[10px] opacity-75 truncate" title={caseDetail.status_description}>
                                    {caseDetail.passed ? 'Passed' : caseDetail.status_description}
                                  </div>
                                  {typeof caseDetail.time === 'number' && (
                                    <div className="text-[9px] opacity-60 font-mono mt-1">
                                      {Math.round(caseDetail.time * 1000)}ms
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
