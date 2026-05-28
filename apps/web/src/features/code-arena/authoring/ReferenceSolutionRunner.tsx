'use client'

import { Play, CheckCircle2, XCircle, Loader2, Code2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiFetch } from '@/lib/api-client'
import type { CodeChallengeSettings, Judge0Language } from '@/services/courses/code-challenges'
import { cn } from '@/lib/utils'

interface ReferenceSolutionRunnerProps {
  draft: CodeChallengeSettings
  languages: Judge0Language[]
}

interface ValidationResultDetail {
  test_id: string
  passed: boolean
  status_description: string
  time?: number
  memory?: number
}

interface ValidationResultLanguage {
  ok: boolean
  status: string
  passed?: number
  total?: number
  score?: number
  compile_output?: string
  message?: string
  details?: ValidationResultDetail[]
}

export function ReferenceSolutionRunner({ draft, languages }: ReferenceSolutionRunnerProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const [isValidating, setIsValidating] = useState(false)
  const [results, setResults] = useState<Record<number, ValidationResultLanguage> | null>(null)

  const selectedLanguages = draft.allowed_languages
    .map(id => languages.find(lang => lang.id === id))
    .filter(Boolean) as Judge0Language[]

  const runValidation = async () => {
    if (selectedLanguages.length === 0) {
      toast.error(t('selectLanguageBeforeValidation'))
      return
    }
    setIsValidating(true)
    setResults(null)
    try {
      const response = await apiFetch(`assessments/${draft.uuid}/code-challenge/validate`, {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || t('validationEndpointFailed'))
      }
      const data = await response.json()
      setResults(data.results)
      toast.success(t('referenceValidationFinished'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('referenceValidationFailed'))
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Runner Toolbar */}
      <div className="bg-muted/20 flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('referenceVerificationSuite')}
        </span>
        <Button
          type="button"
          size="xs"
          onClick={runValidation}
          disabled={isValidating || selectedLanguages.length === 0}
          className="h-7 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
        >
          {isValidating ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {t('validateSolutions')}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-4xl space-y-5 p-6">
          {selectedLanguages.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-sm">
              <Code2 className="text-muted-foreground/30 mb-2 size-8" />
              {t('selectLanguageBeforeValidation')}
            </div>
          ) : (
            <div className="space-y-4">
              {selectedLanguages.map(lang => {
                const starter = draft.starter_code?.[lang.id]
                const solution = draft.reference_solutions?.[lang.id]
                const runResult = results?.[lang.id]

                return (
                  <div key={lang.id} className="bg-card text-card-foreground rounded-lg border shadow-xs">
                    <div className="flex items-center justify-between border-b p-4">
                      <div className="flex items-center gap-2.5">
                        <Code2 className="size-5 text-emerald-600" />
                        <div>
                          <h3 className="text-sm font-semibold">{lang.name}</h3>
                          <div className="text-muted-foreground mt-0.5 flex gap-3 text-xs font-medium">
                            <span className="flex items-center gap-1">
                              {t('starterCodeStatus')}: {starter?.trim() ? t('present') : t('missing')}
                            </span>
                            <span className="flex items-center gap-1">
                              {t('solutionStatus')}: {solution?.trim() ? t('present') : t('missing')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {runResult ? (
                          <div className="flex items-center gap-2">
                            {runResult.ok ? (
                              <Badge variant="success" className="gap-1 text-[10px] font-bold">
                                <CheckCircle2 className="size-3" />
                                {t('passesTests')}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 text-[10px] font-bold">
                                <XCircle className="size-3" />
                                {runResult.status}
                              </Badge>
                            )}
                            {typeof runResult.passed === 'number' && (
                              <span className="text-muted-foreground font-mono text-xs font-semibold">
                                {runResult.passed}/{runResult.total}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] font-bold">
                            {t('awaitingRun')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Result outputs details */}
                    {runResult && (
                      <div className="bg-muted/5 space-y-3 border-t p-4">
                        {runResult.compile_output && (
                          <div className="space-y-1.5">
                            <h4 className="text-[10px] font-bold tracking-wider text-rose-600 uppercase">
                              {t('compilationDiagnostic')}
                            </h4>
                            <pre className="overflow-x-auto rounded border border-rose-500/20 bg-rose-500/10 p-3 font-mono text-xs text-rose-700 dark:bg-rose-950/20 dark:text-rose-300">
                              {runResult.compile_output}
                            </pre>
                          </div>
                        )}

                        {runResult.message && (
                          <div className="space-y-1">
                            <h4 className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                              {t('errorDetails')}
                            </h4>
                            <p className="text-muted-foreground text-xs leading-relaxed">{runResult.message}</p>
                          </div>
                        )}

                        {runResult.details && runResult.details.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                              {t('executionCasesBreakdown')}
                            </h4>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                              {runResult.details.map((caseDetail, idx) => (
                                <div
                                  key={`case-detail-${lang.id}-${idx}`}
                                  className={cn(
                                    'rounded border p-2 text-center text-xs transition-colors duration-150',
                                    caseDetail.passed
                                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300',
                                  )}
                                >
                                  <div className="mb-0.5 truncate font-bold" title={caseDetail.test_id}>
                                    {t('caseNumber', { number: idx + 1 })}
                                  </div>
                                  <div
                                    className="truncate text-[10px] opacity-75"
                                    title={caseDetail.status_description}
                                  >
                                    {caseDetail.passed ? t('passed') : caseDetail.status_description}
                                  </div>
                                  {typeof caseDetail.time === 'number' && (
                                    <div className="mt-1 font-mono text-[9px] opacity-60">
                                      {t('timeMsValue', {
                                        value: Math.round(caseDetail.time * 1000),
                                      })}
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
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
