'use client';

import { CheckCircle2, Code2, Eye, EyeOff, FileText, FlaskConical, Loader2, Save, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor';
import {
  useCodeChallengeSettings,
  useJudge0Languages,
  useSaveCodeChallengeSettings,
} from '@/features/assessments/registry/code-challenge/hooks';
import type { CodeChallengeSettings, TestCase } from '@/services/courses/code-challenges';
import { cn, generateUUID } from '@/lib/utils';

interface CodeChallengeBuilderProps {
  activityUuid: string;
}

type BuilderTab = 'problem' | 'languages' | 'tests' | 'review';

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
};

export function CodeChallengeBuilder({ activityUuid }: CodeChallengeBuilderProps) {
  const [tab, setTab] = useState<BuilderTab>('problem');
  const [draft, setDraft] = useState<CodeChallengeSettings>(DEFAULT_SETTINGS);
  const { data: settings, isLoading } = useCodeChallengeSettings<CodeChallengeSettings>(activityUuid);
  const { data: languages = [] } = useJudge0Languages();
  const saveSettings = useSaveCodeChallengeSettings(activityUuid);
  const selectedLanguages = useMemo(
    () => draft.allowed_languages.map((id) => languages.find((language) => language.id === id)).filter(Boolean),
    [draft.allowed_languages, languages],
  );
  const readiness = useMemo(() => buildReadiness(draft), [draft]);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      ...DEFAULT_SETTINGS,
      ...settings,
      title: settings.title ?? '',
      prompt: settings.prompt ?? '',
      input_spec: settings.input_spec ?? '',
      output_spec: settings.output_spec ?? '',
      constraints: settings.constraints ?? [],
      visible_tests: settings.visible_tests?.length ? settings.visible_tests : [newTestCase(true)],
      hidden_tests: settings.hidden_tests ?? [],
      starter_code: settings.starter_code ?? {},
      reference_solutions: settings.reference_solutions ?? settings.solution_code ?? {},
    });
  }, [settings]);

  const updateDraft = (patch: Partial<CodeChallengeSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    try {
      await saveSettings.mutateAsync({
        ...draft,
        visible_tests: (draft.visible_tests ?? []).map((test) => ({ ...test, is_visible: true })),
        hidden_tests: (draft.hidden_tests ?? []).map((test) => ({ ...test, is_visible: false })),
      });
      toast.success('Code challenge saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save code challenge.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background flex h-[calc(100dvh-9rem)] min-h-[680px] flex-col overflow-hidden rounded-md border">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{draft.title || 'Code challenge builder'}</div>
          <div className="text-muted-foreground text-xs">
            {readiness.blockers.length ? `${readiness.blockers.length} blocking issues` : 'Ready to publish'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={readiness.blockers.length ? 'warning' : 'success'}>
            {readiness.blockers.length ? 'Needs work' : 'Ready'}
          </Badge>
          <Button
            type="button"
            onClick={save}
            disabled={saveSettings.isPending}
          >
            {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as BuilderTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b px-3">
          <TabsList className="h-11 bg-transparent p-0">
            <TabsTrigger
              value="problem"
              className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent"
            >
              <FileText className="size-4" />
              Problem
            </TabsTrigger>
            <TabsTrigger
              value="languages"
              className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent"
            >
              <Code2 className="size-4" />
              Languages
            </TabsTrigger>
            <TabsTrigger
              value="tests"
              className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent"
            >
              <FlaskConical className="size-4" />
              Tests
            </TabsTrigger>
            <TabsTrigger
              value="review"
              className="data-[state=active]:border-primary h-11 rounded-none border-b-2 border-transparent"
            >
              <CheckCircle2 className="size-4" />
              Review
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="problem"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <div className="mx-auto grid max-w-5xl gap-5 p-5">
              <section className="bg-card grid gap-4 rounded-md border p-4">
                <div className="grid gap-4 md:grid-cols-[1fr_160px_160px]">
                  <Field label="Title">
                    <Input
                      value={draft.title ?? ''}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                    />
                  </Field>
                  <Field label="Difficulty">
                    <NativeSelect
                      value={draft.difficulty ?? 'EASY'}
                      onChange={(event) =>
                        updateDraft({ difficulty: event.target.value as CodeChallengeSettings['difficulty'] })
                      }
                    >
                      <NativeSelectOption value="EASY">Easy</NativeSelectOption>
                      <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
                      <NativeSelectOption value="HARD">Hard</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field label="Points">
                    <Input
                      type="number"
                      value={draft.points ?? 100}
                      onChange={(event) => updateDraft({ points: Number(event.target.value) })}
                    />
                  </Field>
                </div>
                <Field label="Problem statement">
                  <Textarea
                    value={draft.prompt ?? ''}
                    onChange={(event) => updateDraft({ prompt: event.target.value })}
                    className="min-h-52"
                    placeholder="Describe the task, examples, and objective in Markdown."
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Input format">
                    <Textarea
                      value={draft.input_spec ?? ''}
                      onChange={(event) => updateDraft({ input_spec: event.target.value })}
                      className="min-h-28"
                    />
                  </Field>
                  <Field label="Output format">
                    <Textarea
                      value={draft.output_spec ?? ''}
                      onChange={(event) => updateDraft({ output_spec: event.target.value })}
                      className="min-h-28"
                    />
                  </Field>
                </div>
                <Field label="Constraints">
                  <Textarea
                    value={(draft.constraints ?? []).join('\n')}
                    onChange={(event) =>
                      updateDraft({
                        constraints: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                    className="min-h-24 font-mono text-sm"
                    placeholder="1 <= n <= 10^5"
                  />
                </Field>
              </section>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="languages"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <div className="grid h-full min-h-0 grid-cols-[300px_1fr]">
            <ScrollArea className="border-r">
              <div className="space-y-2 p-4">
                <div className="text-sm font-semibold">Allowed languages</div>
                {languages.map((language) => {
                  const selected = draft.allowed_languages.includes(language.id);
                  return (
                    <button
                      key={language.id}
                      type="button"
                      onClick={() =>
                        updateDraft({
                          allowed_languages: selected
                            ? draft.allowed_languages.filter((id) => id !== language.id)
                            : [...draft.allowed_languages, language.id],
                        })
                      }
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
                        selected ? 'border-primary bg-primary/5' : 'bg-card',
                      )}
                    >
                      {language.name}
                      {selected ? <CheckCircle2 className="text-primary size-4" /> : null}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <ScrollArea>
              <div className="space-y-4 p-5">
                {!selectedLanguages.length ? (
                  <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
                    Select at least one language to configure starter and reference code.
                  </div>
                ) : (
                  selectedLanguages.map((language) => (
                    <section
                      key={language!.id}
                      className="bg-card grid gap-3 rounded-md border p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{language!.name}</div>
                        <Badge
                          variant={
                            draft.starter_code?.[language!.id] && draft.reference_solutions?.[language!.id]
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {draft.starter_code?.[language!.id] && draft.reference_solutions?.[language!.id]
                            ? 'Complete'
                            : 'Incomplete'}
                        </Badge>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <Field label="Starter code">
                          <CodeEditor
                            value={draft.starter_code?.[language!.id] ?? ''}
                            onChange={(value) =>
                              updateDraft({ starter_code: { ...(draft.starter_code ?? {}), [language!.id]: value } })
                            }
                            languageId={language!.id}
                            monacoLanguage={language!.monaco_language}
                            height={260}
                            options={{ minimap: { enabled: false } }}
                          />
                        </Field>
                        <Field label="Reference solution">
                          <CodeEditor
                            value={draft.reference_solutions?.[language!.id] ?? ''}
                            onChange={(value) =>
                              updateDraft({
                                reference_solutions: { ...(draft.reference_solutions ?? {}), [language!.id]: value },
                              })
                            }
                            languageId={language!.id}
                            monacoLanguage={language!.monaco_language}
                            height={260}
                            options={{ minimap: { enabled: false } }}
                          />
                        </Field>
                      </div>
                    </section>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent
          value="tests"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <TestSuiteEditor
            draft={draft}
            updateDraft={updateDraft}
          />
        </TabsContent>

        <TabsContent
          value="review"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <div className="mx-auto grid max-w-4xl gap-4 p-5">
              <section className="bg-card rounded-md border p-4">
                <div className="mb-3 text-sm font-semibold">Publish readiness</div>
                <div className="space-y-2">
                  {readiness.items.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <CheckCircle2 className={cn('mt-0.5 size-4', item.ok ? 'text-emerald-600' : 'text-amber-600')} />
                      <div>
                        <div className="font-medium">{item.label}</div>
                        {item.detail ? <div className="text-muted-foreground text-xs">{item.detail}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TestSuiteEditor({
  draft,
  updateDraft,
}: {
  draft: CodeChallengeSettings;
  updateDraft: (patch: Partial<CodeChallengeSettings>) => void;
}) {
  const tests = [...(draft.visible_tests ?? []), ...(draft.hidden_tests ?? [])];
  const updateTest = (index: number, patch: Partial<TestCase>) => {
    const next = tests.map((test, testIndex) => (testIndex === index ? { ...test, ...patch } : test));
    updateDraft({
      visible_tests: next.filter((test) => test.is_visible),
      hidden_tests: next.filter((test) => !test.is_visible),
    });
  };
  const removeTest = (index: number) => {
    const next = tests.filter((_, testIndex) => testIndex !== index);
    updateDraft({
      visible_tests: next.filter((test) => test.is_visible),
      hidden_tests: next.filter((test) => !test.is_visible),
    });
  };
  const addTest = (visible: boolean) => {
    const next = [...tests, newTestCase(visible)];
    updateDraft({
      visible_tests: next.filter((test) => test.is_visible),
      hidden_tests: next.filter((test) => !test.is_visible),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div>
          <div className="text-sm font-semibold">Test suite</div>
          <div className="text-muted-foreground text-xs">
            {draft.visible_tests?.length ?? 0} visible, {draft.hidden_tests?.length ?? 0} hidden
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => addTest(true)}
          >
            <Eye className="size-4" />
            Add sample
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => addTest(false)}
          >
            <EyeOff className="size-4" />
            Add hidden
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Group</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="w-24">Weight</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((test, index) => (
                <TableRow key={test.id}>
                  <TableCell>
                    <NativeSelect
                      value={test.is_visible ? 'visible' : 'hidden'}
                      onChange={(event) => updateTest(index, { is_visible: event.target.value === 'visible' })}
                    >
                      <NativeSelectOption value="visible">Visible</NativeSelectOption>
                      <NativeSelectOption value="hidden">Hidden</NativeSelectOption>
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={test.description ?? ''}
                      onChange={(event) => updateTest(index, { description: event.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={test.input}
                      onChange={(event) => updateTest(index, { input: event.target.value })}
                      className="min-h-20 font-mono text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={test.expected_output}
                      onChange={(event) => updateTest(index, { expected_output: event.target.value })}
                      className="min-h-20 font-mono text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={test.weight ?? 1}
                      onChange={(event) => updateTest(index, { weight: Number(event.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTest(index)}
                      disabled={tests.length <= 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function newTestCase(isVisible: boolean): TestCase {
  return {
    id: `test_${generateUUID()}`,
    input: '',
    expected_output: '',
    description: '',
    is_visible: isVisible,
    weight: 1,
    match_mode: 'EXACT',
  };
}

function buildReadiness(settings: CodeChallengeSettings) {
  const visible = settings.visible_tests ?? [];
  const hidden = settings.hidden_tests ?? [];
  const referenceSolutions = settings.reference_solutions ?? {};
  const starterCode = settings.starter_code ?? {};
  const items = [
    {
      label: 'Problem statement',
      ok: Boolean((settings.prompt ?? '').trim() && (settings.title ?? '').trim()),
      detail: 'Title and Markdown statement are required.',
    },
    {
      label: 'Language harness',
      ok:
        settings.allowed_languages.length > 0 &&
        settings.allowed_languages.every((id) => starterCode[id]?.trim() && referenceSolutions[id]?.trim()),
      detail: 'Every enabled language needs starter code and a reference solution.',
    },
    {
      label: 'Visible samples',
      ok: visible.some((test) => test.input.trim() || test.expected_output.trim()),
      detail: 'At least one visible sample gives students a fast feedback loop.',
    },
    {
      label: 'Hidden grading tests',
      ok: hidden.length > 0,
      detail: 'Hidden tests protect final grading quality.',
    },
    {
      label: 'Runtime limits',
      ok: Boolean(settings.time_limit && settings.memory_limit),
      detail: 'Time and memory limits must be explicit.',
    },
  ];
  return {
    items,
    blockers: items.filter((item) => !item.ok),
  };
}
