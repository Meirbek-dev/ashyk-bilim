'use client';
import { Card, CardContent } from '@components/ui/card';
import { Button } from '@components/ui/button';

import { useQueryClient } from '@tanstack/react-query';
import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { GalleryVerticalEnd, Info, TentTree, Trash } from 'lucide-react';
import { deleteAssignmentTask } from '@services/courses/assignments';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

import { AssignmentTaskGeneralEdit } from './Subs/AssignmentTaskGeneralEdit';

const AssignmentTaskContentEdit = dynamic(() => import('./Subs/AssignmentTaskContentEdit'));

interface AssignmentTaskEditorProps {
  page: string;
}

const AssignmentTaskEditor = ({ page }: AssignmentTaskEditorProps) => {
  const t = useTranslations('DashPage.Assignments.TaskEditor');
  const assignment = useAssignments();
  const assignmentTask = useAssignmentsTaskStore((s) => s.assignmentTask);
  const setSelectedTaskUUID = useAssignmentsTaskStore((s) => s.setSelectedTaskUUID);
  const setAssignmentTask = useAssignmentsTaskStore((s) => s.setAssignmentTask);
  const queryClient = useQueryClient();

  const [taskUUIDKey, setTaskUUIDKey] = useState(assignmentTask.assignment_task_uuid);
  const [selectedSubPage, setSelectedSubPage] = useState(page);

  useEffect(() => {
    if (taskUUIDKey !== assignmentTask.assignment_task_uuid) {
      setTaskUUIDKey(assignmentTask.assignment_task_uuid);
      setSelectedSubPage('general');
    }
  }, [assignmentTask.assignment_task_uuid, taskUUIDKey]);

  async function deleteTaskUI() {
    if (!assignment?.assignment_object?.assignment_uuid) {
      toast.error(t('missingAssignmentUUID'));
      return;
    }

    if (!assignmentTask?.assignment_task_uuid) {
      toast.error(t('missingTaskUUID'));
      return;
    }

    const toastId = toast.loading(t('deletingTask'));
    try {
      await deleteAssignmentTask(assignmentTask.assignment_task_uuid, assignment.assignment_object.assignment_uuid);
      setAssignmentTask({});
      setSelectedTaskUUID('');

      try {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.assignments.tasks(assignment.assignment_object.assignment_uuid),
        });
      } catch (error) {
        console.warn('Failed to revalidate assignment tasks after delete', error);
      }

      toast.success(t('deleteSuccess'), { id: toastId });
    } catch {
      toast.error(t('deleteError'));
    }
  }

  return (
    <div className="z-20 flex h-full w-full flex-col overflow-auto text-sm font-bold">
      {assignmentTask && Object.keys(assignmentTask).length > 0 ? (
        <div className="flex h-full flex-col space-y-3">
          <Card className="ring-foreground/10 z-10 mb-3 flex shrink-0 flex-col pt-5 pr-10 pl-10 text-sm tracking-tight shadow-sm ring-1">
            <div className="flex items-center justify-between py-1">
              <div className="text-lg font-semibold">{assignmentTask.title}</div>
              <div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteTaskUI}
                  aria-label={t('deleteTask')}
                >
                  <Trash
                    size={18}
                    className="mr-2"
                  />
                  {t('deleteTask')}
                </Button>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setSelectedSubPage('general')}
                aria-pressed={selectedSubPage === 'general'}
                className={`flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                  selectedSubPage === 'general'
                    ? 'border-primary text-primary border-b-4'
                    : 'text-muted-foreground opacity-50 hover:opacity-100'
                }`}
              >
                <div className="mx-2 flex items-center space-x-2.5">
                  <Info size={16} />
                  <span>{t('general')}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSubPage('content')}
                aria-pressed={selectedSubPage === 'content'}
                className={`flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                  selectedSubPage === 'content'
                    ? 'border-primary text-primary border-b-4'
                    : 'text-muted-foreground opacity-50 hover:opacity-100'
                }`}
              >
                <div className="mx-2 flex items-center space-x-2.5">
                  <GalleryVerticalEnd size={16} />
                  <span>{t('content')}</span>
                </div>
              </button>
            </div>
          </Card>
          <Card className="ring-foreground/10 mx-auto mr-10 ml-10 min-h-0 flex-1 overflow-auto shadow-sm ring-1">
            <CardContent className="p-6">
              {selectedSubPage === 'general' && <AssignmentTaskGeneralEdit />}
              {selectedSubPage === 'content' && <AssignmentTaskContentEdit />}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {Object.keys(assignmentTask).length === 0 && (
        <Card className="ring-foreground/10 z-10 flex flex-1 flex-col pt-5 pr-10 pl-10 text-sm tracking-tight shadow-sm ring-1">
          <div className="text-muted-foreground flex h-full items-center justify-center antialiased opacity-40">
            <div className="flex flex-col items-center space-y-2">
              <TentTree size={60} />
              <div className="py-1 text-2xl font-semibold">{t('noTaskSelected')}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AssignmentTaskEditor;
