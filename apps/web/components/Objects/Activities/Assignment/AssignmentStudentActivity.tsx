'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import TaskFileObject from '@/app/_shared/dash/assignments/[assignmentuuid]/_components/TaskEditor/Subs/TaskTypes/TaskFileObject';
import { useAssignmentTaskSubmission } from '@/features/assignments/hooks/useAssignments';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { getAssignmentTaskSubmissionsMe, handleAssignmentTaskSubmission } from '@services/courses/assignments';
import { AlertCircle, Backpack, Calendar, CheckCircle2, Download, Info, Loader2 } from 'lucide-react';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Alert, AlertDescription } from '@components/ui/alert';
import { getTaskRefFileDir } from '@services/media/media';
import { Card, CardContent } from '@components/ui/card';
import { Separator } from '@components/ui/separator';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { toast } from 'sonner';

// Type definitions
type AssignmentType = 'QUIZ' | 'FILE_SUBMISSION' | 'FORM' | 'OTHER' | string;

interface QuizOption {
  optionUUID?: string;
  text?: string;
}

interface QuizQuestion {
  questionUUID?: string;
  questionText?: string;
  options?: QuizOption[];
}

interface FormBlank {
  blankUUID?: string;
  placeholder?: string;
}

interface FormQuestion {
  questionUUID?: string;
  questionText?: string;
  blanks?: FormBlank[];
}

interface AssignmentTaskContents {
  questions?: QuizQuestion[] | FormQuestion[];
}

interface TaskSubmissionRead {
  assignment_task_submission_uuid?: string;
  task_submission?: Record<string, unknown> | null;
}

interface QuizSubmissionState {
  answers: Record<string, string[]>;
}

interface FormSubmissionState {
  answers: Record<string, string>;
}

interface AssignmentTask {
  id: number;
  assignment_task_uuid: string;
  title?: string;
  description: string;
  hint?: string | null;
  reference_file?: string | null;
  assignment_type: AssignmentType;
  max_grade_value?: number;
  contents?: AssignmentTaskContents | null;
}

interface AssignmentObject {
  assignment_uuid: string;
  due_date?: string | null;
  description?: string | null;
}

interface CourseObject {
  course_uuid: string;
}

interface ActivityObject {
  activity_uuid: string;
}

interface AssignmentsData {
  assignment_object?: AssignmentObject | null;
  assignment_tasks?: AssignmentTask[] | null;
  course_object?: CourseObject | null;
  activity_object?: ActivityObject | null;
}

const EMPTY_QUIZ_SUBMISSION: QuizSubmissionState = { answers: {} };
const EMPTY_FORM_SUBMISSION: FormSubmissionState = { answers: {} };

function normalizeQuizSubmission(value: unknown): QuizSubmissionState {
  const answers =
    value && typeof value === 'object' && 'answers' in value && value.answers && typeof value.answers === 'object'
      ? Object.fromEntries(
          Object.entries(value.answers as Record<string, unknown>).map(([questionId, selected]) => [
            questionId,
            Array.isArray(selected) ? selected.filter((item): item is string => typeof item === 'string') : [],
          ]),
        )
      : {};

  return { answers };
}

function normalizeFormSubmission(value: unknown): FormSubmissionState {
  const answers =
    value && typeof value === 'object' && 'answers' in value && value.answers && typeof value.answers === 'object'
      ? Object.fromEntries(
          Object.entries(value.answers as Record<string, unknown>).map(([blankId, answer]) => [
            blankId,
            typeof answer === 'string' ? answer : '',
          ]),
        )
      : {};

  return { answers };
}

async function loadTaskSubmission({
  assignmentTaskUUID,
  assignmentUUID,
}: {
  assignmentTaskUUID: string;
  assignmentUUID: string;
}): Promise<TaskSubmissionRead | null> {
  const res = await getAssignmentTaskSubmissionsMe(assignmentTaskUUID, assignmentUUID);
  if (!res.success || !res.data) {
    return null;
  }

  return res.data as TaskSubmissionRead;
}

async function saveTaskSubmission({
  assignmentTaskUUID,
  assignmentUUID,
  submissionUUID,
  taskSubmission,
}: {
  assignmentTaskUUID: string;
  assignmentUUID: string;
  submissionUUID?: string;
  taskSubmission: Record<string, unknown>;
}): Promise<TaskSubmissionRead | null> {
  const body = {
    ...(submissionUUID ? { assignment_task_submission_uuid: submissionUUID } : {}),
    task_submission: taskSubmission,
  };

  const res = await handleAssignmentTaskSubmission({
    body,
    assignmentTaskUUID,
    assignmentUUID,
  });

  if (!res.success || !res.data) {
    throw new Error(res.data?.detail || 'save_failed');
  }

  return res.data as TaskSubmissionRead;
}

const AssignmentStudentActivity = () => {
  const t = useTranslations('Activities.AssignmentStudentActivity');
  const assignments = useAssignments() as AssignmentsData | null;

  // Early returns for loading/error states
  if (!assignments) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-slate-500">{t('loading', { default: 'Loading assignment...' })}</p>
      </div>
    );
  }

  if (!assignments.assignment_object) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-slate-500">{t('noAssignment', { default: 'No assignment found' })}</p>
      </div>
    );
  }

  const { assignment_object, assignment_tasks, course_object, activity_object } = assignments;

  // Sort tasks (plain computation - avoid conditional hooks)
  const sortedTasks: AssignmentTask[] = assignment_tasks ? [...assignment_tasks].toSorted((a, b) => a.id - b.id) : [];

  const hasTasks = sortedTasks.length > 0;

  return (
    <Card className="bg-background border-border border">
      <CardContent className="flex flex-col gap-6">
        {/* Header Section */}
        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Badge
                variant="secondary"
                className="h-7 w-fit gap-2 px-4 py-2"
              >
                <Backpack className="h-4 w-4" />
                <span className="font-semibold">{t('assignment')}</span>
              </Badge>

              {assignment_object.due_date && (
                <>
                  <Separator
                    orientation="vertical"
                    className="hidden h-6 sm:block"
                  />
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">
                      {t('dueDate')}: {assignment_object.due_date}
                    </span>
                  </div>
                </>
              )}
            </div>

            {assignment_object.description && (
              <>
                <Separator className="my-4" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Info className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold">{t('descriptionTitle')}</h3>
                  </div>
                  <p className="pl-6 text-sm leading-relaxed text-slate-600">{assignment_object.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tasks Section */}
        {!hasTasks ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-slate-500">{t('noTasks', { default: 'No tasks available' })}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {sortedTasks.map((task, index) => (
              <TaskCard
                key={task.assignment_task_uuid}
                task={task}
                index={index}
                assignments={assignments}
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Extracted TaskCard component for better organization
interface TaskCardProps {
  task: AssignmentTask;
  index: number;
  assignments: AssignmentsData;
  t: ReturnType<typeof useTranslations>;
}

const TaskCard = ({ task, index, assignments, t }: TaskCardProps) => {
  const hasHint = Boolean(task.hint);
  const hasReferenceFile = Boolean(task.reference_file);
  const hasTitle = Boolean(task.title?.trim());
  const hasDescription = Boolean(task.description?.trim());

  const referenceFileUrl = useMemo(() => {
    if (
      !hasReferenceFile ||
      !assignments.course_object ||
      !assignments.activity_object ||
      !assignments.assignment_object
    ) {
      return null;
    }

    const referenceFileId = task.reference_file;
    if (!referenceFileId) {
      return null;
    }

    return getTaskRefFileDir({
      courseUUID: assignments.course_object.course_uuid,
      activityUUID: assignments.activity_object.activity_uuid,
      assignmentUUID: assignments.assignment_object.assignment_uuid,
      assignmentTaskUUID: task.assignment_task_uuid,
      fileID: referenceFileId,
    });
  }, [hasReferenceFile, assignments, task]);

  return (
    <Card>
      <CardContent className="p-6 pt-0">
        {/* Task Header */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-800">{t('task', { index: index + 1 })}</span>
              <TaskTypeBadge
                assignmentType={task.assignment_type}
                t={t}
              />
              {typeof task.max_grade_value === 'number' && task.max_grade_value > 0 ? (
                <Badge variant="secondary">{t('points', { count: task.max_grade_value })}</Badge>
              ) : null}
            </div>

            {hasTitle ? <h4 className="text-base font-medium text-slate-800">{task.title}</h4> : null}
            {hasDescription ? <p className="break-words text-slate-600">{task.description}</p> : null}
          </div>

          {/* Task Actions */}
          {(hasHint || hasReferenceFile) && (
            <div className="flex flex-wrap gap-2">
              {hasHint && (
                <Popover>
                  <PopoverTrigger>
                    <Badge
                      variant="outline"
                      className="h-7 cursor-pointer gap-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      role="button"
                      tabIndex={0}
                    >
                      <Info className="h-3 w-3" />
                      <span className="text-xs font-semibold">{t('hint')}</span>
                    </Badge>
                  </PopoverTrigger>
                  <PopoverContent className="max-h-[200px] overflow-y-auto">
                    <p className="text-sm text-slate-700">{task.hint}</p>
                  </PopoverContent>
                </Popover>
              )}

              {hasReferenceFile && referenceFileUrl && (
                <Link
                  href={referenceFileUrl}
                  target="_blank"
                  download
                  className="inline-flex"
                >
                  <Badge
                    variant="outline"
                    className="h-7 cursor-pointer gap-2 border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
                  >
                    <Download className="h-3 w-3" />
                    <span className="text-xs font-semibold">{t('referenceDocument')}</span>
                  </Badge>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Task Content */}
        <div className="w-full">
          <TaskContent
            task={task}
            t={t}
          />
        </div>
      </CardContent>
    </Card>
  );
};

interface TaskTypeBadgeProps {
  assignmentType: AssignmentType;
  t: ReturnType<typeof useTranslations>;
}

const TaskTypeBadge = ({ assignmentType, t }: TaskTypeBadgeProps) => {
  const labelByType: Record<string, string> = {
    FILE_SUBMISSION: t('taskTypeFile'),
    QUIZ: t('taskTypeQuiz'),
    FORM: t('taskTypeForm'),
    OTHER: t('taskTypeOther'),
  };

  return <Badge variant="outline">{labelByType[assignmentType] ?? assignmentType}</Badge>;
};

interface TaskContentProps {
  task: AssignmentTask;
  t: ReturnType<typeof useTranslations>;
}

const TaskContent = ({ task, t }: TaskContentProps) => {
  if (task.assignment_type === 'FILE_SUBMISSION') {
    return (
      <TaskFileObject
        view="student"
        assignmentTaskUUID={task.assignment_task_uuid}
      />
    );
  }

  if (task.assignment_type === 'QUIZ') {
    return (
      <InteractiveQuizTask
        task={task}
        questions={task.contents?.questions}
        t={t}
      />
    );
  }

  if (task.assignment_type === 'FORM') {
    return (
      <InteractiveFormTask
        task={task}
        questions={task.contents?.questions}
        t={t}
      />
    );
  }

  return <TaskPlaceholder message={t('taskContentUnavailable')} />;
};

const TaskPlaceholder = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
    {message}
  </div>
);

interface InteractiveQuizTaskProps {
  task: AssignmentTask;
  questions?: QuizQuestion[];
  t: ReturnType<typeof useTranslations>;
}

const InteractiveQuizTask = ({ task, questions, t }: InteractiveQuizTaskProps) => {
  const assignments = useAssignments();
  const queryClient = useQueryClient();
  const assignmentUUID = assignments.assignment_object?.assignment_uuid;
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  const [submissionUUID, setSubmissionUUID] = useState<string | undefined>();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const submissionQuery = useAssignmentTaskSubmission<TaskSubmissionRead>(assignmentUUID, task.assignment_task_uuid);
  const saveSubmissionMutation = useMutation({
    mutationFn: async (taskSubmission: Record<string, unknown>) => {
      if (!assignmentUUID) {
        throw new Error('missing_assignment_uuid');
      }

      return saveTaskSubmission({
        assignmentTaskUUID: task.assignment_task_uuid,
        assignmentUUID,
        submissionUUID,
        taskSubmission,
      });
    },
    onSuccess: (saved) => {
      if (!assignmentUUID || !saved) return;

      queryClient.setQueryData<TaskSubmissionRead | null>(
        queryKeys.assignments.taskSubmission(assignmentUUID, task.assignment_task_uuid),
        saved,
      );
    },
  });

  useEffect(() => {
    if (!assignmentUUID || !task.assignment_task_uuid) {
      setSubmissionUUID(undefined);
      setAnswers({});
      setInitialAnswers({});
      return;
    }

    const normalized = normalizeQuizSubmission(submissionQuery.data?.task_submission);
    setSubmissionUUID(submissionQuery.data?.assignment_task_submission_uuid);
    setAnswers(normalized.answers);
    setInitialAnswers(normalized.answers);
  }, [assignmentUUID, submissionQuery.data, task.assignment_task_uuid]);

  if (normalizedQuestions.length === 0) {
    return <TaskPlaceholder message={t('taskContentUnavailable')} />;
  }

  const isDirty = JSON.stringify(answers) !== JSON.stringify(initialAnswers);
  const isLoading = submissionQuery.isPending;
  const isSaving = saveSubmissionMutation.isPending;
  const effectiveError = error ?? (submissionQuery.error ? t('loadSubmissionError') : null);

  const toggleOption = (questionId: string, optionId: string) => {
    setAnswers((current) => {
      const previous = current[questionId] ?? [];
      const next = previous.includes(optionId)
        ? previous.filter((value) => value !== optionId)
        : [...previous, optionId];

      return {
        ...current,
        [questionId]: next,
      };
    });
  };

  const handleSave = async () => {
    if (!assignmentUUID) {
      return;
    }

    setError(null);
    try {
      const saved = await saveSubmissionMutation.mutateAsync({ answers });
      const normalized = normalizeQuizSubmission(saved?.task_submission);
      setSubmissionUUID(saved?.assignment_task_submission_uuid);
      setAnswers(normalized.answers);
      setInitialAnswers(normalized.answers);
      toast.success(t('progressSaved'));
    } catch (saveError) {
      setError(t('saveSubmissionError'));
      console.error(saveError);
    }
  };

  return (
    <div className="space-y-4">
      {effectiveError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{effectiveError}</AlertDescription>
        </Alert>
      ) : null}

      {normalizedQuestions.map((question, questionIndex) => {
        const options = Array.isArray(question.options) ? question.options : [];
        const questionId = question.questionUUID ?? `question_${questionIndex}`;

        return (
          <div
            key={question.questionUUID ?? questionIndex}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">{t('questionLabel', { index: questionIndex + 1 })}</Badge>
              <p className="font-medium text-slate-800">{question.questionText || t('untitledQuestion')}</p>
            </div>

            {options.length > 0 ? (
              <div className="space-y-2">
                {options.map((option, optionIndex) => (
                  <button
                    key={option.optionUUID ?? optionIndex}
                    type="button"
                    onClick={() => toggleOption(questionId, option.optionUUID ?? `option_${optionIndex}`)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      (answers[questionId] ?? []).includes(option.optionUUID ?? `option_${optionIndex}`)
                        ? 'border-cyan-500 bg-cyan-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {String.fromCodePoint(65 + optionIndex)}
                    </span>
                    <span className="flex-1 text-sm text-slate-700">{option.text || t('emptyOption')}</span>
                    {(answers[questionId] ?? []).includes(option.optionUUID ?? `option_${optionIndex}`) ? (
                      <CheckCircle2 className="h-4 w-4 text-cyan-600" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <TaskPlaceholder message={t('taskContentUnavailable')} />
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-3">
        {isDirty ? <span className="text-xs text-amber-700">{t('unsavedChanges')}</span> : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={isLoading || isSaving || !isDirty}
        >
          {isSaving || isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('saveProgress')}
        </Button>
      </div>
    </div>
  );
};

interface InteractiveFormTaskProps {
  task: AssignmentTask;
  questions?: FormQuestion[];
  t: ReturnType<typeof useTranslations>;
}

const InteractiveFormTask = ({ task, questions, t }: InteractiveFormTaskProps) => {
  const assignments = useAssignments();
  const queryClient = useQueryClient();
  const assignmentUUID = assignments.assignment_object?.assignment_uuid;
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  const [submissionUUID, setSubmissionUUID] = useState<string | undefined>();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submissionQuery = useAssignmentTaskSubmission<TaskSubmissionRead>(assignmentUUID, task.assignment_task_uuid);
  const saveSubmissionMutation = useMutation({
    mutationFn: async (taskSubmission: Record<string, unknown>) => {
      if (!assignmentUUID) {
        throw new Error('missing_assignment_uuid');
      }

      return saveTaskSubmission({
        assignmentTaskUUID: task.assignment_task_uuid,
        assignmentUUID,
        submissionUUID,
        taskSubmission,
      });
    },
    onSuccess: (saved) => {
      if (!assignmentUUID || !saved) return;

      queryClient.setQueryData<TaskSubmissionRead | null>(
        queryKeys.assignments.taskSubmission(assignmentUUID, task.assignment_task_uuid),
        saved,
      );
    },
  });

  useEffect(() => {
    if (!assignmentUUID || !task.assignment_task_uuid) {
      setSubmissionUUID(undefined);
      setAnswers({});
      setInitialAnswers({});
      return;
    }

    const normalized = normalizeFormSubmission(submissionQuery.data?.task_submission);
    setSubmissionUUID(submissionQuery.data?.assignment_task_submission_uuid);
    setAnswers(normalized.answers);
    setInitialAnswers(normalized.answers);
  }, [assignmentUUID, submissionQuery.data, task.assignment_task_uuid]);

  if (normalizedQuestions.length === 0) {
    return <TaskPlaceholder message={t('taskContentUnavailable')} />;
  }

  const isDirty = JSON.stringify(answers) !== JSON.stringify(initialAnswers);
  const isLoading = submissionQuery.isPending;
  const isSaving = saveSubmissionMutation.isPending;
  const effectiveError = error ?? (submissionQuery.error ? t('loadSubmissionError') : null);

  const handleInputChange = (blankId: string, value: string) => {
    setAnswers((current) => ({
      ...current,
      [blankId]: value,
    }));
  };

  const handleSave = async () => {
    if (!assignmentUUID) {
      return;
    }

    setError(null);
    try {
      const saved = await saveSubmissionMutation.mutateAsync({ answers });
      const normalized = normalizeFormSubmission(saved?.task_submission);
      setSubmissionUUID(saved?.assignment_task_submission_uuid);
      setAnswers(normalized.answers);
      setInitialAnswers(normalized.answers);
      toast.success(t('progressSaved'));
    } catch (saveError) {
      setError(t('saveSubmissionError'));
      console.error(saveError);
    }
  };

  return (
    <div className="space-y-4">
      {effectiveError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{effectiveError}</AlertDescription>
        </Alert>
      ) : null}

      {normalizedQuestions.map((question, questionIndex) => {
        const blanks = Array.isArray(question.blanks) ? question.blanks : [];

        return (
          <div
            key={question.questionUUID ?? questionIndex}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">{t('questionLabel', { index: questionIndex + 1 })}</Badge>
              <p className="font-medium text-slate-800">{question.questionText || t('untitledQuestion')}</p>
            </div>

            {blanks.length > 0 ? (
              <div className="space-y-3">
                {blanks.map((blank, blankIndex) => (
                  <div
                    key={blank.blankUUID ?? blankIndex}
                    className="space-y-2"
                  >
                    <label className="text-sm font-medium text-slate-700">
                      {blank.placeholder || t('blankLabel', { index: blankIndex + 1 })}
                    </label>
                    <Input
                      value={answers[blank.blankUUID ?? `blank_${blankIndex}`] ?? ''}
                      onChange={(event) =>
                        handleInputChange(blank.blankUUID ?? `blank_${blankIndex}`, event.target.value)
                      }
                      placeholder={blank.placeholder || t('blankLabel', { index: blankIndex + 1 })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <TaskPlaceholder message={t('taskContentUnavailable')} />
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-3">
        {isDirty ? <span className="text-xs text-amber-700">{t('unsavedChanges')}</span> : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={isLoading || isSaving || !isDirty}
        >
          {isSaving || isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('saveProgress')}
        </Button>
      </div>
    </div>
  );
};

export default AssignmentStudentActivity;
