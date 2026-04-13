'use client';

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Info,
  Loader2,
  Minus,
  Plus,
  PlusCircle,
  Settings,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn, generateUUID } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import AssignmentBoxUI from '@components/Objects/Activities/Assignment/AssignmentBoxUI';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { updateAssignmentTask } from '@services/courses/assignments';

// ============================================================================
// Types
// ============================================================================

interface QuizOption {
  optionUUID?: string;
  text: string;
  fileID: string;
  type: 'text' | 'image' | 'audio' | 'video';
  assigned_right_answer: boolean;
}

interface QuizQuestion {
  questionText: string;
  questionUUID?: string;
  options: QuizOption[];
}

interface QuizSettings {
  max_attempts?: number | null;
  time_limit_seconds?: number | null;
  max_score_penalty_per_attempt?: number | null;
  prevent_copy?: boolean;
  track_violations?: boolean;
  max_violations?: number;
  block_on_violations?: boolean;
}

interface TaskQuizObjectProps {
  assignmentTaskUUID?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_QUESTIONS = 10;
const MAX_OPTIONS = 6;
const DEFAULT_MAX_VIOLATIONS = 2;

const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  max_attempts: null,
  time_limit_seconds: null,
  max_score_penalty_per_attempt: null,
  prevent_copy: true,
  track_violations: true,
  max_violations: DEFAULT_MAX_VIOLATIONS,
  block_on_violations: true,
};

// ============================================================================
// Helpers
// ============================================================================

const createQuestion = (): QuizQuestion => ({
  questionText: '',
  questionUUID: `question_${generateUUID()}`,
  options: [createOption()],
});

const createOption = (): QuizOption => ({
  text: '',
  fileID: '',
  type: 'text',
  assigned_right_answer: false,
  optionUUID: `option_${generateUUID()}`,
});

// ============================================================================
// Sub-components
// ============================================================================

interface OptionLetterBadgeProps {
  index: number;
}

const OptionLetterBadge = ({ index }: OptionLetterBadgeProps) => (
  <div className="bg-muted text-muted-foreground flex h-full w-10 shrink-0 items-center justify-center rounded-l-lg font-semibold">
    {String.fromCodePoint(65 + index)}
  </div>
);

interface CorrectAnswerToggleProps {
  isCorrect: boolean;
  onClick?: () => void;
  t: (key: string) => string;
}

const CorrectAnswerToggle = ({ isCorrect, onClick, t }: CorrectAnswerToggleProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant={isCorrect ? 'default' : 'secondary'}
            className={cn(
              'gap-1 cursor-pointer transition-colors',
              isCorrect
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-rose-100 text-rose-600 hover:bg-rose-200',
            )}
            onClick={onClick}
          >
            {isCorrect ? <Check className="size-3" /> : <X className="size-3" />}
            <span className="text-xs font-medium">{isCorrect ? t('true') : t('false')}</span>
          </Badge>
        }
      />
      <TooltipContent>
        <p>{isCorrect ? t('markedAsTrue') : t('markedAsFalse')}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface QuizSettingsPanelProps {
  settings: QuizSettings;
  onSettingsChange: (settings: QuizSettings) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}

const QuizSettingsPanel = ({ settings, onSettingsChange, isOpen, onOpenChange, t }: QuizSettingsPanelProps) => {
  const updateSetting = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>{t('settings.title')}</CardTitle>
            </div>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                </Button>
              }
            />
          </div>
          <CardDescription>{t('settings.description')}</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Attempt Limits */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <Label
                  htmlFor="max-attempts"
                  className="text-sm font-semibold"
                >
                  {t('settings.maxAttempts')}
                </Label>
              </div>
              <Input
                id="max-attempts"
                type="number"
                min="1"
                max="5"
                placeholder={t('settings.unlimited')}
                value={settings.max_attempts ?? ''}
                onChange={(e) => updateSetting('max_attempts', e.target.value ? Number.parseInt(e.target.value) : null)}
              />
            </div>

            {/* Time Limit */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <Label
                  htmlFor="time-limit"
                  className="text-sm font-semibold"
                >
                  {t('settings.timeLimit')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="time-limit"
                  type="number"
                  min="1"
                  placeholder={t('settings.noLimit')}
                  value={settings.time_limit_seconds ? settings.time_limit_seconds / 60 : ''}
                  onChange={(e) =>
                    updateSetting('time_limit_seconds', e.target.value ? Number.parseInt(e.target.value) * 60 : null)
                  }
                />
                <span className="text-muted-foreground text-sm">{t('settings.minutes')}</span>
              </div>
            </div>

            {/* Attempt Penalty */}
            <div className="space-y-3">
              <Label
                htmlFor="penalty"
                className="text-sm font-semibold"
              >
                {t('settings.attemptPenalty')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="penalty"
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  placeholder="0"
                  value={settings.max_score_penalty_per_attempt ?? ''}
                  onChange={(e) =>
                    updateSetting(
                      'max_score_penalty_per_attempt',
                      e.target.value ? Number.parseFloat(e.target.value) : null,
                    )
                  }
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-muted-foreground text-xs">{t('settings.attemptPenaltyHint')}</p>
            </div>

            <Separator />

            {/* Anti-Cheat Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                <Label className="text-sm font-semibold">{t('settings.antiCheat')}</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="prevent-copy"
                    className="text-sm"
                  >
                    {t('settings.preventCopy')}
                  </Label>
                  <Switch
                    id="prevent-copy"
                    checked={settings.prevent_copy}
                    onCheckedChange={(checked) => updateSetting('prevent_copy', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="track-violations"
                    className="text-sm"
                  >
                    {t('settings.trackViolations')}
                  </Label>
                  <Switch
                    id="track-violations"
                    checked={settings.track_violations}
                    onCheckedChange={(checked) => updateSetting('track_violations', checked)}
                  />
                </div>

                {settings.track_violations && (
                  <>
                    <div className="space-y-2">
                      <Label
                        htmlFor="max-violations"
                        className="text-sm"
                      >
                        {t('settings.maxViolations')}
                      </Label>
                      <Input
                        id="max-violations"
                        type="number"
                        min="1"
                        max="10"
                        value={settings.max_violations ?? DEFAULT_MAX_VIOLATIONS}
                        onChange={(e) => updateSetting('max_violations', Number.parseInt(e.target.value))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="block-violations"
                        className="text-sm"
                      >
                        {t('settings.blockOnViolations')}
                      </Label>
                      <Switch
                        id="block-violations"
                        checked={settings.block_on_violations}
                        onCheckedChange={(checked) => updateSetting('block_on_violations', checked)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const TaskQuizObject = ({ assignmentTaskUUID }: TaskQuizObjectProps) => {
  const t = useTranslations('DashPage.Assignments.TaskQuizObject');
  const assignmentTask = useAssignmentsTaskStore((s) => s.assignmentTask);
  const reload = useAssignmentsTaskStore((s) => s.reload);
  const setSelectedTaskUUID = useAssignmentsTaskStore((s) => s.setSelectedTaskUUID);
  const assignment = useAssignments();

  const initialQuestions = useMemo(
    () => (assignmentTask.contents?.questions as QuizQuestion[] | undefined) ?? [createQuestion()],
    [assignmentTask.contents?.questions],
  );

  const initialSettings = useMemo(
    () => ({
      ...DEFAULT_QUIZ_SETTINGS,
      ...(assignmentTask.contents?.settings as Record<string, unknown> | undefined),
    }),
    [assignmentTask.contents?.settings],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState(initialQuestions);
  const [quizSettings, setQuizSettings] = useState(initialSettings);
  const [showSettings, setShowSettings] = useState(false);

  const canAddQuestion = questions.length < MAX_QUESTIONS;

  const handleQuestionChange = useCallback((index: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], questionText: value };
      }
      return updated;
    });
  }, []);

  const handleOptionChange = useCallback((qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex]?.options[oIndex]) {
        updated[qIndex] = {
          ...updated[qIndex],
          options: updated[qIndex].options.map((opt, i) => (i === oIndex ? { ...opt, text: value } : opt)),
        };
      }
      return updated;
    });
  }, []);

  const addOption = useCallback((qIndex: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex] && updated[qIndex].options.length < MAX_OPTIONS) {
        updated[qIndex] = {
          ...updated[qIndex],
          options: [...updated[qIndex].options, createOption()],
        };
      }
      return updated;
    });
  }, []);

  const removeOption = useCallback(
    (qIndex: number, oIndex: number) => {
      setQuestions((prev) => {
        const updated = [...prev];
        if (updated[qIndex] && updated[qIndex].options.length > 1) {
          updated[qIndex] = {
            ...updated[qIndex],
            options: updated[qIndex].options.filter((_, i) => i !== oIndex),
          };
          return updated;
        }
        toast.error(t('optionDeleteError'));
        return prev;
      });
    },
    [t],
  );

  const addQuestion = useCallback(() => {
    if (canAddQuestion) {
      setQuestions((prev) => [...prev, createQuestion()]);
    }
  }, [canAddQuestion]);

  const removeQuestion = useCallback((qIndex: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
  }, []);

  const toggleOption = useCallback((qIndex: number, oIndex: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex]?.options[oIndex]) {
        updated[qIndex] = {
          ...updated[qIndex],
          options: updated[qIndex].options.map((opt, i) =>
            i === oIndex ? { ...opt, assigned_right_answer: !opt.assigned_right_answer } : opt,
          ),
        };
      }
      return updated;
    });
  }, []);

  const saveFC = useCallback(async () => {
    setIsSaving(true);
    try {
      const taskUUID = assignmentTask.assignment_task_uuid;
      const assignmentUUID = assignment.assignment_object.assignment_uuid;
      if (!taskUUID || !assignmentUUID) {
        toast.error(t('saveError')); // fallback when required ids aren't available
        return;
      }

      const res = await updateAssignmentTask({
        body: { contents: { questions, settings: quizSettings } },
        assignmentTaskUUID: taskUUID,
        assignmentUUID,
      });

      if (res) {
        reload();
        toast.success(t('saveSuccess'));
      } else {
        toast.error(t('saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    questions,
    quizSettings,
    assignmentTask.assignment_task_uuid,
    assignment.assignment_object.assignment_uuid,
    reload,
    t,
  ]);

  useEffect(() => {
    if (assignmentTaskUUID) {
      setSelectedTaskUUID(assignmentTaskUUID);
    }
  }, [assignmentTaskUUID, setSelectedTaskUUID]);

  if (!questions || questions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-muted-foreground flex items-center justify-center gap-2 py-8">
          <Info className="size-4" />
          <p className="text-sm">{t('noQuestionsFound')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <AssignmentBoxUI
      submitFC={async () => {}}
      saveFC={saveFC}
      gradeFC={async () => {}}
      view="teacher"
      type="quiz"
    >
      <div className="space-y-6">
        <QuizSettingsPanel
          settings={quizSettings}
          onSettingsChange={setQuizSettings}
          isOpen={showSettings}
          onOpenChange={setShowSettings}
          t={t}
        />

        {questions.map((question, qIndex) => (
          <Card
            key={question.questionUUID || qIndex}
            className="border-border/50 overflow-hidden pt-0 shadow-sm transition-shadow hover:shadow-md"
          >
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {qIndex + 1}
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={question.questionText}
                    onChange={(e) => handleQuestionChange(qIndex, e.target.value)}
                    placeholder={t('questionPlaceholder')}
                    className="flex-1 border-dashed font-medium"
                  />
                  <AlertDialog>
                    <AlertDialogTrigger
                      nativeButton
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteQuestionTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('deleteQuestionDescription')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeQuestion(qIndex)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t('delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="space-y-2 pl-11">
                {question.options.map((option, oIndex) => (
                  <div
                    key={option.optionUUID || oIndex}
                    className="flex gap-2"
                  >
                    <div className="group bg-card flex flex-1 items-center overflow-hidden rounded-lg border transition-all">
                      <OptionLetterBadge index={oIndex} />
                      <div className="flex flex-1 items-center gap-2 px-3 py-2">
                        <Input
                          value={option.text}
                          onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                          placeholder={t('optionPlaceholder')}
                          className="flex-1 border-dashed text-sm"
                        />
                        <CorrectAnswerToggle
                          isCorrect={option.assigned_right_answer}
                          onClick={() => toggleOption(qIndex, oIndex)}
                          t={t}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                          onClick={() => removeOption(qIndex, oIndex)}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {oIndex === question.options.length - 1 && question.options.length < MAX_OPTIONS && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-[42px] shrink-0"
                                onClick={() => addOption(qIndex)}
                              >
                                <Plus className="size-4" />
                              </Button>
                            }
                          />
                          <TooltipContent>
                            <p>{t('addOption')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {canAddQuestion && (
          <Button
            variant="outline"
            className="text-muted-foreground hover:border-primary hover:text-primary w-full gap-2 border-dashed py-6"
            onClick={addQuestion}
          >
            <PlusCircle className="size-4" />
            {t('addQuestion')}
          </Button>
        )}
      </div>

      {isSaving && (
        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm">
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-5 animate-spin" />
            <span>{t('saving')}</span>
          </div>
        </div>
      )}
    </AssignmentBoxUI>
  );
};

export default TaskQuizObject;
