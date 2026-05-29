'use client'

import { CheckCircle2, Code2, FileText, FlaskConical, Loader2, Save, Sparkles, ClipboardCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
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
import { PublishReadinessPanel } from './PublishReadinessPanel'

interface CodeChallengeBuilderProps {
  activityUuid: string
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

export function CodeChallengeBuilder({ activityUuid }: CodeChallengeBuilderProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const [tab, setTab] = useState<BuilderTab>('problem')
  const [draft, setDraft] = useState<CodeChallengeSettings>(DEFAULT_SETTINGS)
  const { data: settings, isLoading } = useCodeChallengeSettings<CodeChallengeSettings>(activityUuid)
  const { data: languages = [] } = useJudge0Languages()
  const saveSettings = useSaveCodeChallengeSettings(activityUuid)

  const selectedLanguages = useMemo(
    () =>
      draft.allowed_languages
        .map(id => languages.find(language => language.id === id))
        .filter((lang): lang is NonNullable<typeof lang> => lang !== undefined),
    [draft.allowed_languages, languages],
  )

  const readiness = useMemo(() => buildReadiness(draft, t), [draft, t])
  const blockersCount = readiness.items.filter(item => !item.ok).length
  const firstMarkdownIssue = useMemo(() => getFirstBlockingCodeChallengeMarkdownIssue(draft), [draft])

  useEffect(() => {
    if (!settings) return
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
  }, [settings])

  const updateDraft = (patch: Partial<CodeChallengeSettings>) => {
    setDraft(current => ({ ...current, ...patch }))
  }

  const save = async () => {
    if (firstMarkdownIssue) {
      toast.error(`${firstMarkdownIssue.field}: ${firstMarkdownIssue.issue.message}`)
      return
    }

    try {
      await saveSettings.mutateAsync({
        ...draft,
        visible_tests: (draft.visible_tests ?? []).map(test => Object.assign(test, { is_visible: true })),
        hidden_tests: (draft.hidden_tests ?? []).map(test => Object.assign(test, { is_visible: false })),
      })
      toast.success(t('configSaved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('configSaveFailed'))
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
              <Sparkles className="size-4" />
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
          <ReferenceSolutionRunner draft={draft} languages={languages} />
        </TabsContent>

        <TabsContent value="review" className="min-h-0 flex-1 overflow-hidden">
          <PublishReadinessPanel draft={draft} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function buildReadiness(settings: CodeChallengeSettings, t: any) {
  const visible = settings.visible_tests ?? []
  const hidden = settings.hidden_tests ?? []
  const referenceSolutions = settings.reference_solutions ?? {}
  const starterCode = settings.starter_code ?? {}
  const markdownIssue = getFirstBlockingCodeChallengeMarkdownIssue(settings)

  const items = [
    {
      label: t('readiness.problem.label'),
      ok: Boolean((settings.prompt ?? '').trim() && (settings.title ?? '').trim()),
    },
    {
      label: t('readiness.languages.label'),
      ok:
        settings.allowed_languages.length > 0 &&
        settings.allowed_languages.every(id => starterCode[id]?.trim() && referenceSolutions[id]?.trim()),
    },
    {
      label: t('readiness.visible.label'),
      ok: visible.some(test => test.input.trim() || test.expected_output.trim()),
    },
    {
      label: t('readiness.hidden.label'),
      ok: hidden.length > 0,
    },
    {
      label: t('readiness.limits.label'),
      ok: Boolean(settings.time_limit && settings.memory_limit),
    },
    {
      label: 'Markdown safety',
      ok: !markdownIssue,
    },
  ]
  return {
    items,
    blockers: items.filter(item => !item.ok),
  }
}
