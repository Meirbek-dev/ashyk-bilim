'use client';

import { ChevronDown, GripVertical, Lightbulb, Loader2, Plus, Trash2, Type } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import AssignmentBoxUI from '@components/Objects/Activities/Assignment/AssignmentBoxUI';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { updateAssignmentTask } from '@services/courses/assignments';
import { cn, generateUUID } from '@/lib/utils';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// Types
// ============================================================================

interface BlankSchema {
  blankUUID?: string;
  placeholder: string;
  correctAnswer: string;
  hint?: string;
}

interface FormSchema {
  questionText: string;
  questionUUID?: string;
  blanks: BlankSchema[];
}

interface BlankChangeParams {
  qIndex: number;
  bIndex: number;
  field: 'placeholder' | 'correctAnswer' | 'hint';
  value: string;
}

interface TaskFormObjectProps {
  assignmentTaskUUID: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const normalizeQuestion = (question: Partial<FormSchema>): FormSchema => ({
  questionText: question.questionText || '',
  questionUUID: question.questionUUID || `question_${generateUUID()}`,
  blanks: Array.isArray(question.blanks)
    ? (question.blanks as Partial<BlankSchema>[]).map((b) => ({
        placeholder: b?.placeholder ?? '',
        correctAnswer: b?.correctAnswer ?? '',
        hint: b?.hint ?? '',
        blankUUID: b?.blankUUID ?? `blank_${generateUUID()}`,
      }))
    : [],
});

const normalizeQuestions = (questions: unknown): FormSchema[] => {
  if (!Array.isArray(questions)) return [];
  return (questions as unknown[]).map((q) => normalizeQuestion(q as Partial<FormSchema>));
};

const createDefaultBlank = (placeholder?: string): BlankSchema => ({
  placeholder: placeholder ?? '',
  correctAnswer: '',
  hint: '',
  blankUUID: `blank_${generateUUID()}`,
});

const createDefaultQuestion = (placeholder?: string): FormSchema => ({
  questionText: '',
  questionUUID: `question_${generateUUID()}`,
  blanks: [createDefaultBlank(placeholder)],
});

// ============================================================================
// Sub-Components
// ============================================================================

interface BlankInputTeacherProps {
  blank: BlankSchema;
  qIndex: number;
  bIndex: number;
  isLast: boolean;
  canAddMore: boolean;
  canRemove: boolean;
  onBlankChange: (params: BlankChangeParams) => void;
  onAddBlank: (qIndex: number) => void;
  onRemoveBlank: (qIndex: number, bIndex: number) => void;
}

function BlankInputTeacher({
  blank,
  qIndex,
  bIndex,
  isLast,
  canAddMore,
  canRemove,
  onBlankChange,
  onAddBlank,
  onRemoveBlank,
}: BlankInputTeacherProps) {
  const t = useTranslations('Components.TaskFormObject');

  return (
    <div className="flex items-start gap-2">
      <Card className="flex-1 transition-shadow hover:shadow-md">
        <CardContent className="flex items-start gap-3 p-3">
          <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
            <Type className="text-muted-foreground h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">{t('placeholderText')}</Label>
              <Input
                value={blank.placeholder}
                onChange={(e) => onBlankChange({ qIndex, bIndex, field: 'placeholder', value: e.target.value })}
                placeholder={t('placeholderText')}
                className="placeholder:text-muted-foreground h-8 rounded-md border bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-green-600">{t('correctAnswerPlaceholder')}</Label>
              <Input
                value={blank.correctAnswer}
                onChange={(e) => onBlankChange({ qIndex, bIndex, field: 'correctAnswer', value: e.target.value })}
                placeholder={t('correctAnswerPlaceholder')}
                className="h-8 border-green-200 bg-green-50 focus-visible:ring-green-500"
              />
            </div>
            <Collapsible>
              <CollapsibleTrigger
                nativeButton
                render={
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'h-6 gap-1 px-2 text-xs flex items-center',
                    )}
                  >
                    <Lightbulb className="h-3 w-3" />
                    {t('hintOptional')}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                }
              />
              <CollapsibleContent className="pt-2">
                <Input
                  value={blank.hint || ''}
                  onChange={(e) => onBlankChange({ qIndex, bIndex, field: 'hint', value: e.target.value })}
                  placeholder={t('hintOptional')}
                  className="h-8 border-blue-200 bg-blue-50 text-sm focus-visible:ring-blue-500"
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => onRemoveBlank(qIndex, bIndex)}
                    disabled={!canRemove}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
              <TooltipContent>{t('removeBlank')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
      {isLast && canAddMore && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="mt-3 h-10 w-10 shrink-0"
                  onClick={() => onAddBlank(qIndex)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>{t('addBlank')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

interface QuestionCardProps {
  question: FormSchema;
  qIndex: number;
  onQuestionChange: (index: number, value: string) => void;
  onBlankChange: (params: BlankChangeParams) => void;
  onAddBlank: (qIndex: number) => void;
  onRemoveBlank: (qIndex: number, bIndex: number) => void;
  onRemoveQuestion: (qIndex: number) => void;
}

function QuestionCard({
  question,
  qIndex,
  onQuestionChange,
  onBlankChange,
  onAddBlank,
  onRemoveBlank,
  onRemoveQuestion,
}: QuestionCardProps) {
  const t = useTranslations('Components.TaskFormObject');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <GripVertical className="text-muted-foreground mt-2 h-5 w-5 shrink-0 cursor-grab" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="shrink-0"
              >
                Q{qIndex + 1}
              </Badge>
              <Input
                value={question.questionText}
                onChange={(e) => onQuestionChange(qIndex, e.target.value)}
                placeholder={t('questionPlaceholder')}
                className="placeholder:text-muted-foreground h-9 rounded-md border bg-white px-3 font-medium focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <CardDescription className="mt-1">{t('blanksCount', { count: question.blanks.length })}</CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => onRemoveQuestion(qIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
              <TooltipContent>{t('removeQuestion')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        {question.blanks.map((blank, bIndex) => (
          <BlankInputTeacher
            key={blank.blankUUID || bIndex}
            blank={blank}
            qIndex={qIndex}
            bIndex={bIndex}
            isLast={bIndex === question.blanks.length - 1}
            canAddMore={question.blanks.length < 5}
            canRemove={question.blanks.length > 1}
            onBlankChange={onBlankChange}
            onAddBlank={onAddBlank}
            onRemoveBlank={onRemoveBlank}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function TaskFormObject({ assignmentTaskUUID }: TaskFormObjectProps) {
  const t = useTranslations('Components.TaskFormObject');
  const assignmentTask = useAssignmentsTaskStore((s) => s.assignmentTask);
  const reload = useAssignmentsTaskStore((s) => s.reload);
  const setSelectedTaskUUID = useAssignmentsTaskStore((s) => s.setSelectedTaskUUID);
  const assignment = useAssignments();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [questions, setQuestions] = useState<FormSchema[]>(() => {
    const savedQuestions = assignmentTask.contents?.questions;
    if (savedQuestions) {
      return normalizeQuestions(savedQuestions);
    }
    return [createDefaultQuestion(t('blankPlaceholder'))];
  });

  const handleQuestionChange = (index: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], questionText: value };
      }
      return updated;
    });
  };

  const handleBlankChange = ({ qIndex, bIndex, field, value }: BlankChangeParams) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex]?.blanks[bIndex]) {
        updated[qIndex] = {
          ...updated[qIndex],
          blanks: updated[qIndex].blanks.map((b, i) => (i === bIndex ? { ...b, [field]: value } : b)),
        };
      }
      return updated;
    });
  };

  const addBlank = (qIndex: number) => {
    setQuestions((prev) => {
      if (!prev[qIndex]) return prev;
      return prev.map((q, i) =>
        i === qIndex ? { ...q, blanks: [...q.blanks, createDefaultBlank(t('blankPlaceholder'))] } : q,
      );
    });
  };

  const removeBlank = (qIndex: number, bIndex: number) => {
    setQuestions((prev) => {
      const q = prev[qIndex];
      if (!q) return prev;
      if (q.blanks.length === 1) {
        toast.error(t('removeBlankError'));
        return prev;
      }
      return prev.map((item, i) =>
        i === qIndex ? { ...item, blanks: item.blanks.filter((_, j) => j !== bIndex) } : item,
      );
    });
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, createDefaultQuestion(t('blankPlaceholder'))]);
  };

  const removeQuestion = (qIndex: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
  };

  const saveFC = async () => {
    const assignmentUUID = assignment.assignment_object?.assignment_uuid;
    if (!assignmentTask.assignment_task_uuid || !assignmentUUID) {
      toast.error(t('saveError'));
      return;
    }
    setIsSaving(true);
    try {
      const res = await updateAssignmentTask({
        body: { contents: { questions } },
        assignmentTaskUUID: assignmentTask.assignment_task_uuid,
        assignmentUUID,
      });
      if (res) {
        reload();
        toast.success(t('savedSuccessfully'));
      } else {
        toast.error(t('saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (assignmentTaskUUID) {
      setSelectedTaskUUID(assignmentTaskUUID);
    }
  }, [assignmentTaskUUID, setSelectedTaskUUID]);

  if (isLoading) {
    return (
      <AssignmentBoxUI
        submitFC={async () => {}}
        saveFC={saveFC}
        gradeFC={async () => {}}
        view="teacher"
        type="form"
      >
        <LoadingSkeleton />
      </AssignmentBoxUI>
    );
  }

  return (
    <AssignmentBoxUI
      submitFC={async () => {}}
      saveFC={saveFC}
      gradeFC={async () => {}}
      view="teacher"
      type="form"
    >
      <div className="space-y-4">
        {questions.map((question, qIndex) => (
          <QuestionCard
            key={question.questionUUID || qIndex}
            question={question}
            qIndex={qIndex}
            onQuestionChange={handleQuestionChange}
            onBlankChange={handleBlankChange}
            onAddBlank={addBlank}
            onRemoveBlank={removeBlank}
            onRemoveQuestion={removeQuestion}
          />
        ))}
      </div>

      {questions.length < 6 && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={addQuestion}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t('addQuestion')}
        </Button>
      )}
    </AssignmentBoxUI>
  );
}

export default TaskFormObject;
