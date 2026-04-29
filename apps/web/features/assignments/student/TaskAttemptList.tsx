'use client';

import { FileUp, ListTodo, TextCursorInput } from 'lucide-react';

import type { AssignmentTaskAnswer } from '@/features/assignments/domain';
import type { AssignmentTaskRead } from '@/features/assignments/domain';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import type { AssignmentAnswerMap } from './types';
import FileAttempt from './attempts/FileAttempt';
import FormAttempt from './attempts/FormAttempt';
import QuizAttempt from './attempts/QuizAttempt';

interface TaskAttemptListProps {
  tasks: AssignmentTaskRead[];
  answers: AssignmentAnswerMap;
  disabled?: boolean;
  courseUuid?: string | null;
  activityUuid?: string | null;
  assignmentUuid: string;
  onAnswerChange: (answer: AssignmentTaskAnswer) => void;
}

export default function TaskAttemptList({
  tasks,
  answers,
  disabled,
  courseUuid,
  activityUuid,
  assignmentUuid,
  onAnswerChange,
}: TaskAttemptListProps) {
  if (tasks.length === 0) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No tasks.</div>;
  }

  return (
    <div className="space-y-5">
      {tasks.map((task, index) => {
        const answer = answers[task.assignment_task_uuid] ?? null;
        const Icon = task.assignment_type === 'QUIZ' ? ListTodo : task.assignment_type === 'FORM' ? TextCursorInput : FileUp;
        return (
          <Card key={task.assignment_task_uuid}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Task {index + 1}</Badge>
                    <Badge variant="outline">
                      <Icon className="size-3" />
                      {task.assignment_type.replaceAll('_', ' ')}
                    </Badge>
                    <Badge variant="outline">{task.max_grade_value} pts</Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">{task.title || 'Untitled task'}</h2>
                  {task.description ? <p className="text-muted-foreground mt-1 text-sm">{task.description}</p> : null}
                </div>
              </div>

              {task.assignment_type === 'QUIZ' ? (
                <QuizAttempt
                  task={task}
                  answer={answer}
                  disabled={disabled}
                  onChange={onAnswerChange}
                />
              ) : task.assignment_type === 'FORM' ? (
                <FormAttempt
                  task={task}
                  answer={answer}
                  disabled={disabled}
                  onChange={onAnswerChange}
                />
              ) : (
                <FileAttempt
                  task={task}
                  answer={answer}
                  disabled={disabled}
                  courseUuid={courseUuid}
                  activityUuid={activityUuid}
                  assignmentUuid={assignmentUuid}
                  onChange={onAnswerChange}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
