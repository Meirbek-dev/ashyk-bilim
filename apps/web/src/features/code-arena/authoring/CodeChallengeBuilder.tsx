'use client'

import {
  CheckCircle2,
  ClipboardCheck,
  Code2,
  FileText,
  FlaskConical,
  Loader2,
  PlayCircle,
  Save,
  Send,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/error-state'
import { useApiError } from '@/hooks/useApiError'
import { courseKeys } from '@/hooks/courses/courseKeys'
import { apiJson } from '@/lib/api-client'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor'
import {
  useCodeChallengeSettings,
  useJudge0Languages,
  useSaveCodeChallengeSettings,
} from '@/features/assessments/registry/code-challenge/hooks'
import { getFirstBlockingCodeChallengeMarkdownIssue } from '../domain'
import type { CodeChallengeSettings } from '@/services/courses/code-challenges'
import { cn } from '@/lib/utils'

// Import our modular authoring builder subcomponents
import { ProblemStatementEditor } from './ProblemStatementEditor'
import { TestSuiteBuilder } from './TestSuiteBuilder'
import { ReferenceSolutionRunner } from './ReferenceSolutionRunner'
import { PublishReadinessPanel, buildReadiness, useMarkdownIssueText } from './PublishReadinessPanel'

interface CodeChallengeBuilderProps {
  activityUuid: string
  courseUuid: string
}

type BuilderTab = 'problem' | 'languages' | 'tests' | 'verify' | 'review'

const DEFAULT_SETTINGS: CodeChallengeSettings = {
  uuid: '',
  title: '',
  prompt: '',
  input_spec: '',
  output_spec: '',
  constraints: [],
  difficulty: 'EASY',
  time_limit: 2,
  memory_limit: 256,
  time_limit_ms: 2000,
  memory_limit_kb: 256 * 1024,
  grading_strategy: 'PARTIAL_CREDIT',
  execution_mode: 'COMPLETE_FEEDBACK',
  allow_custom_input: true,
  points: 100,
  allowed_languages: [],
  visible_tests: [],
  hidden_tests: [],
  starter_code: {},
  reference_solutions: {},
  hints: [],
}

export function CodeChallengeBuilder({ activityUuid, courseUuid }: CodeChallengeBuilderProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const tStudio = useTranslations('Features.Assessments.Studio')
  const queryClient = useQueryClient()
  const [isPublishing, setIsPublishing] = useState(false)
  const [tab, setTab] = useState<BuilderTab>('problem')
  const [draft, setDraft] = useState<CodeChallengeSettings>(DEFAULT_SETTINGS)
  const { data: settings, isLoading } = useCodeChallengeSettings(activityUuid)
  const { data: languages = [], error: languagesError } = useJudge0Languages()
  const saveSettings = useSaveCodeChallengeSettings(activityUuid)
  const { toastApiError } = useApiError()

  const selectedLanguages = useMemo(
    () =>
      draft.allowed_languages
        .map(id => languages.find(language => language.id === id))
        .filter((lang): lang is NonNullable<typeof lang> => lang !== undefined),
    [draft.allowed_languages, languages],
  )

  const markdownIssueText = useMarkdownIssueText()
  const readiness = useMemo(() => buildReadiness(draft, t, markdownIssueText), [draft, t, markdownIssueText])
  const blockersCount = readiness.items.filter(item => !item.ok).length
  const firstMarkdownIssue = useMemo(() => getFirstBlockingCodeChallengeMarkdownIssue(draft), [draft])

  const [prevSettings, setPrevSettings] = useState(settings)
  if (settings !== prevSettings) {
    setPrevSettings(settings)
    if (settings) {
      setDraft({
        ...DEFAULT_SETTINGS,
        ...settings,
        title: settings.title ?? '',
        prompt: settings.prompt ?? '',
        input_spec: settings.input_spec ?? '',
        output_spec: settings.output_spec ?? '',
        constraints: settings.constraints ?? [],
        visible_tests: settings.visible_tests ?? [],
        hidden_tests: settings.hidden_tests ?? [],
        starter_code: settings.starter_code ?? {},
        reference_solutions: settings.reference_solutions ?? settings.solution_code ?? {},
      })
    }
  }

  const updateDraft = (patch: Partial<CodeChallengeSettings>) => {
    setDraft(current => ({ ...current, ...patch }))
  }

  /** Persists the draft; `false` once the failure has been toasted. An unchanged draft sends nothing (UX-284). */
  const persist = async () => {
    if (firstMarkdownIssue) {
      toast.error(markdownIssueText(firstMarkdownIssue))
      return false
    }
    // UX-282: out-of-range limits would make Judge0 refuse every run.
    const limits = readiness.items.find(item => item.id === 'limits')
    if (limits && !limits.ok) {
      toast.error(limits.detail)
      return false
    }

    try {
      await saveSettings.mutateAsync({
        ...draft,
        visible_tests: (draft.visible_tests ?? []).map(test => Object.assign(test, { is_visible: true })),
        hidden_tests: (draft.hidden_tests ?? []).map(test => Object.assign(test, { is_visible: false })),
      })
      return true
    } catch (error) {
      // UX-284: problem+json codes (e.g. a locked assessment) are localized.
      toastApiError(error, { fallback: t('configSaveFailed') })
      return false
    }
  }

  const save = async () => {
    if (await persist()) toast.success(t('configSaved'))
  }

  // BUG-385: the only way a code challenge goes live — the curriculum toggle
  // refuses a draft assessment (409 `activity-not-ready`).
  const isDraft = (settings?.lifecycle_status ?? 'draft') === 'draft'
  const publish = async () => {
    if (!settings?.uuid) return
    setIsPublishing(true)
    const published = tStudio('lifecycle.published')
    try {
      if (!(await persist())) return
      await apiJson(`assessments/${settings.uuid}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'published', scheduled_at_unix: null }),
      })
      toast.success(tStudio('lifecycleChanged', { state: published }))
    } catch (error) {
      if (hasErrorCode(error, 'conflict')) toast.error(tStudio('lifecycleConflict', { state: published }))
      else toastApiError(error, { fallback: tStudio('updateLifecycleFailed') })
    } finally {
      setIsPublishing(false)
      // The studio badge, the curriculum row and the course readiness move with the lifecycle (UX-085).
      const course = courseUuid.replace(/^course_/, '')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.codeChallenges.settings(activityUuid) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.activity(activityUuid.replace(/^activity_/, '')),
        }),
        queryClient.invalidateQueries({ queryKey: courseKeys.structure(course).slice(0, 3) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.courses.readiness(course) }),
      ])
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-background flex h-[calc(100dvh-9rem)] min-h-[680px] flex-col overflow-hidden rounded-md border">
      {/* Header bar */}
      <div className="bg-muted/10 flex h-14 shrink-0 items-center justify-between border-b px-4 select-none">
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-semibold">{draft.title || t('configureChallenge')}</div>
          <div className="text-muted-foreground mt-0.5 text-xs font-medium">
            {blockersCount > 0 ? t('requirementsPending', { count: blockersCount }) : t('allChecksPassed')}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Badge variant={blockersCount > 0 ? 'warning' : 'success'} className="text-[10px] font-bold uppercase">
            {blockersCount > 0 ? t('draftNeedsWork') : t('readyToPublish')}
          </Badge>
          <Button
            type="button"
            onClick={save}
            disabled={saveSettings.isPending || Boolean(firstMarkdownIssue)}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            {saveSettings.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {t('saveSettings')}
          </Button>
          {isDraft ? (
            <Button
              type="button"
              variant="outline"
              onClick={publish}
              disabled={isPublishing || saveSettings.isPending || blockersCount > 0}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              {isPublishing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {tStudio('publishNow')}
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={value => setTab(value as BuilderTab)} className="flex min-h-0 flex-1 flex-col">
        {/* Tab triggers */}
        <div className="bg-muted/5 border-b px-3">
          <TabsList className="h-11 gap-1 bg-transparent p-0">
            <TabsTrigger
              value="problem"
              className="data-[state=active]:border-primary h-11 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <FileText className="size-4" />
              {t('stepProblem')}
            </TabsTrigger>
            <TabsTrigger
              value="languages"
              className="data-[state=active]:border-primary h-11 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <Code2 className="size-4" />
              {t('stepLanguages')}
            </TabsTrigger>
            <TabsTrigger
              value="tests"
              className="data-[state=active]:border-primary h-11 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <FlaskConical className="size-4" />
              {t('stepTestSuite')}
            </TabsTrigger>
            <TabsTrigger
              value="verify"
              className="data-[state=active]:border-primary h-11 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <PlayCircle className="size-4" />
              {t('stepVerify')}
            </TabsTrigger>
            <TabsTrigger
              value="review"
              className="data-[state=active]:border-primary h-11 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <ClipboardCheck className="size-4" />
              {t('stepReview')}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Contents */}
        <TabsContent value="problem" className="min-h-0 flex-1 overflow-hidden">
          <ProblemStatementEditor draft={draft} onChange={updateDraft} />
        </TabsContent>

        <TabsContent value="languages" className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-[280px_1fr] overflow-hidden">
            {/* Allowed checkbox side pane */}
            <ScrollArea className="bg-muted/5 border-r">
              <div className="space-y-2 p-4">
                <h3 className="text-muted-foreground mb-3 text-xs font-bold tracking-wider uppercase">
                  {t('allowedLanguages')}
                </h3>
                {languagesError ? (
                  <InlineError
                    description={t('languageServiceUnavailableDescription')}
                    error={languagesError}
                    title={t('languageServiceUnavailableTitle')}
                  />
                ) : null}
                {languages.map(language => {
                  const selected = draft.allowed_languages.includes(language.id)
                  return (
                    <button
                      key={language.id}
                      type="button"
                      onClick={() =>
                        updateDraft({
                          allowed_languages: selected
                            ? draft.allowed_languages.filter(id => id !== language.id)
                            : [...draft.allowed_languages, language.id],
                        })
                      }
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs font-semibold transition-all duration-150',
                        selected
                          ? 'border-emerald-500/20 bg-emerald-500/[0.03] text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted/10',
                      )}
                    >
                      {language.name}
                      {selected ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
                    </button>
                  )
                })}
              </div>
            </ScrollArea>

            {/* Monaco editors pane */}
            <ScrollArea className="h-full">
              <div className="max-w-5xl space-y-6 p-6">
                {selectedLanguages.length === 0 ? (
                  <div className="text-muted-foreground rounded-md border border-dashed p-10 text-center text-sm">
                    {t('selectLanguagePrompt')}
                  </div>
                ) : (
                  selectedLanguages.map(language => (
                    <section key={language.id} className="bg-card grid gap-4 rounded-lg border p-5 shadow-xs">
                      <div className="flex items-center justify-between border-b pb-2">
                        <div className="text-foreground text-sm font-bold">{language.name}</div>
                        <Badge
                          variant={
                            draft.starter_code?.[language.id]?.trim() &&
                            draft.reference_solutions?.[language.id]?.trim()
                              ? 'success'
                              : 'warning'
                          }
                          className="text-[10px] font-bold"
                        >
                          {draft.starter_code?.[language.id]?.trim() && draft.reference_solutions?.[language.id]?.trim()
                            ? t('complete')
                            : t('incomplete')}
                        </Badge>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="grid gap-1.5">
                          <span className="text-muted-foreground text-[10px] font-bold uppercase">
                            {t('starterTemplateCode')}
                          </span>
                          <CodeEditor
                            value={draft.starter_code?.[language.id] ?? ''}
                            onChange={value =>
                              updateDraft({
                                starter_code: {
                                  ...draft.starter_code,
                                  [language.id]: value,
                                },
                              })
                            }
                            languageId={language.id}
                            monacoLanguage={language.monaco_language}
                            height={280}
                            options={{ minimap: { enabled: false } }}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <span className="text-muted-foreground text-[10px] font-bold uppercase">
                            {t('referenceSolution')}
                          </span>
                          <CodeEditor
                            value={draft.reference_solutions?.[language.id] ?? ''}
                            onChange={value =>
                              updateDraft({
                                reference_solutions: {
                                  ...draft.reference_solutions,
                                  [language.id]: value,
                                },
                              })
                            }
                            languageId={language.id}
                            monacoLanguage={language.monaco_language}
                            height={280}
                            options={{ minimap: { enabled: false } }}
                          />
                        </div>
                      </div>
                    </section>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="min-h-0 flex-1 overflow-hidden">
          <TestSuiteBuilder draft={draft} onChange={updateDraft} />
        </TabsContent>

        <TabsContent value="verify" className="min-h-0 flex-1 overflow-hidden">
          {/* UX-281: the server checks the stored solutions, so verifying saves the draft first. */}
          <ReferenceSolutionRunner draft={draft} languages={languages} onBeforeValidate={persist} />
        </TabsContent>

        <TabsContent value="review" className="min-h-0 flex-1 overflow-hidden">
          <PublishReadinessPanel draft={draft} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
