'use client';

import { BookOpen, CheckCircle2, FileText, Lightbulb, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownCodeBlock, MarkdownContent, extractMarkdownSummary } from '@/features/content-markdown';
import { cn } from '@/lib/utils';
import type { CodeArenaTab, CodeChallengeProblem, CodeChallengeSettings, CodeSubmission } from '../domain';
import { SubmissionTimeline } from './SubmissionTimeline';

interface ProblemPaneProps {
  problem: CodeChallengeProblem;
  settings: CodeChallengeSettings;
  submissions: CodeSubmission[];
  activeTab: CodeArenaTab;
  onTabChange: (tab: CodeArenaTab) => void;
  onUseInput: (input: string) => void;
  onRestoreSubmission?: (submission: CodeSubmission) => void;
}

export function ProblemPane({
  problem,
  settings,
  submissions,
  activeTab,
  onTabChange,
  onUseInput,
  onRestoreSubmission,
}: ProblemPaneProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const visibleTests = settings.visible_tests ?? [];
  const hiddenCount = settings.hidden_tests?.length ?? 0;
  const [revealedHints, setRevealedHints] = useState<Set<string>>(() => new Set());

  const promptFallback = useMemo(() => {
    if (problem.prompt.trim()) return problem.prompt;
    return 'No problem statement has been written yet.';
  }, [problem.prompt]);

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as CodeArenaTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b px-3 pt-2">
          <TabsList className="h-9 bg-transparent p-0">
            <TabsTrigger
              value="description"
              className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-2"
            >
              <FileText className="size-3.5" />
              {t('descriptionTab')}
            </TabsTrigger>
            <TabsTrigger
              value="hints"
              className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-2"
            >
              <Lightbulb className="size-3.5" />
              {t('hintsTab')}
            </TabsTrigger>
            <TabsTrigger
              value="submissions"
              className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-2"
            >
              <ListChecks className="size-3.5" />
              {t('submissionsTab')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="description"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <div className="space-y-5 p-5">
              <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {problem.difficulty ? (
                    <Badge variant={difficultyTone(problem.difficulty)}>{problem.difficulty}</Badge>
                  ) : null}
                  {typeof problem.points === 'number' ? <Badge variant="outline">{problem.points} {t('pointsShort')}</Badge> : null}
                  {problem.timeLimitSeconds ? <Badge variant="secondary">{t('timeSecondsValue', { value: problem.timeLimitSeconds })}</Badge> : null}
                  {problem.memoryLimitMb ? <Badge variant="secondary">{t('memoryLimitValue', { value: problem.memoryLimitMb })}</Badge> : null}
                  {hiddenCount > 0 ? <Badge variant="outline">{t('hiddenTestsCount', { count: hiddenCount })}</Badge> : null}
                </div>
                <h1 className="text-2xl font-semibold tracking-normal">{problem.title}</h1>
              </header>

              <MarkdownContent
                content={promptFallback}
                mode="codeProblem"
              />

              {problem.inputSpec || problem.outputSpec ? (
                <section className="grid gap-3">
                  {problem.inputSpec ? (
                    <SpecBlock
                      title={t('input')}
                      content={problem.inputSpec}
                    />
                  ) : null}
                  {problem.outputSpec ? (
                    <SpecBlock
                      title={t('output')}
                      content={problem.outputSpec}
                    />
                  ) : null}
                </section>
              ) : null}

              {visibleTests.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <BookOpen className="size-4" />
                    {t('examplesTitle')}
                  </div>
                  {visibleTests.map((test, index) => (
                    <div
                       key={`${test.id}-${index}`}
                      className="bg-card rounded-md border"
                    >
                      <div className="flex items-center justify-between border-b px-3 py-2">
                        <div className="text-sm font-medium">
                          {t('exampleNumber', { number: index + 1 })}
                          {test.description ? (
                            <span className="text-muted-foreground"> - {extractMarkdownSummary(test.description, 100)}</span>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onUseInput(test.input)}
                        >
                          {t('useInput')}
                        </Button>
                      </div>
                      <div className="grid gap-3 p-3">
                        <CodeBlock label={t('input')}>{test.input || 'No input'}</CodeBlock>
                        <CodeBlock label={t('output')}>{test.expected_output}</CodeBlock>
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              {problem.constraints.length > 0 ? (
                <section className="space-y-2">
                  <div className="text-sm font-semibold">{t('constraintsTitle')}</div>
                  <ul className="space-y-1.5">
                    {problem.constraints.map((constraint, index) => (
                      <li
                        key={`${constraint}-${index}`}
                        className="flex items-start gap-2 text-sm"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{constraint}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="hints"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <div className="space-y-3 p-5">
              {settings.hints?.length ? (
                [...settings.hints]
                  .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((hint, index) => {
                    const hintId = hint.id ?? String(index);
                    const revealed = revealedHints.has(hintId);
                    return (
                      <div
                        key={hintId}
                        className={cn('rounded-md border p-3', revealed ? 'bg-card' : 'bg-muted/30')}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{t('hintNumber', { number: index + 1 })}</div>
                            <div className="text-muted-foreground text-xs">{t('xpPenaltyValue', { penalty: hint.xp_penalty })}</div>
                          </div>
                          {!revealed ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setRevealedHints((current) => new Set(current).add(hintId))}
                            >
                              {t('reveal')}
                            </Button>
                          ) : null}
                        </div>
                        {revealed ? (
                          <MarkdownContent
                            content={hint.content}
                            className="mt-3"
                            mode="compactRichText"
                          />
                        ) : null}
                      </div>
                    );
                  })
              ) : (
                <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
                  {t('noHintsAvailable')}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="submissions"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <SubmissionTimeline
            submissions={submissions}
            onRestoreSubmission={onRestoreSubmission}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecBlock({ title, content }: { title: string; content: string }) {
  return (
    <section className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      <MarkdownContent
        content={content}
        mode="codeSpec"
      />
    </section>
  );
}

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-xs font-medium">{label}</div>
      <MarkdownCodeBlock
        code={children}
        language="text"
        compact
      />
    </div>
  );
}

function difficultyTone(difficulty: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (difficulty === 'EASY') return 'success';
  if (difficulty === 'MEDIUM') return 'warning';
  if (difficulty === 'HARD') return 'destructive';
  return 'secondary';
}
