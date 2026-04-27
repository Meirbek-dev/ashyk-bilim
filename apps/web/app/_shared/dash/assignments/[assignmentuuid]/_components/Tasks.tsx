import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import type { AssignmentTaskData } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { FileUp, ListTodo, PanelLeftOpen, Plus, Type } from 'lucide-react';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { Card, CardContent } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import NewTaskModal from './Modals/NewTaskModal';

interface AssignmentTasksProps {
  assignment_uuid: string;
}

interface AssignmentTaskRow extends AssignmentTaskData {
  id: number;
  assignment_task_uuid: string;
  assignment_type?: string;
  title?: string;
}

const AssignmentTasks = ({ assignment_uuid }: AssignmentTasksProps) => {
  const t = useTranslations('DashPage.Assignments.Tasks');
  const assignments = useAssignments();
  const selectedAssignmentTaskUUID = useAssignmentsTaskStore((s) => s.selectedAssignmentTaskUUID);
  const setSelectedTaskUUID = useAssignmentsTaskStore((s) => s.setSelectedTaskUUID);
  const setAssignmentTask = useAssignmentsTaskStore((s) => s.setAssignmentTask);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  return (
    <div className="flex h-full w-full overflow-auto">
      <div className="mx-auto flex flex-col space-y-3 p-4">
        {assignments?.assignment_tasks && assignments.assignment_tasks.length < 10 ? (
          <Modal
            isDialogOpen={isNewTaskModalOpen}
            onOpenChange={setIsNewTaskModalOpen}
            minHeight="sm"
            minWidth="sm"
            dialogContent={
              <NewTaskModal
                assignment_uuid={assignment_uuid}
                closeModal={setIsNewTaskModalOpen}
              />
            }
            dialogTitle={t('addTaskModalTitle')}
            dialogDescription={t('addTaskModalDescription')}
            dialogTrigger={
              <Button
                size="sm"
                variant="default"
                className="flex items-center gap-1"
              >
                <Plus size={17} />
                {t('addTask')}
              </Button>
            }
          />
        ) : null}
        {assignments?.assignment_tasks?.map((task: AssignmentTaskRow) => {
          return (
            <Card
              key={task.id}
              className={`w-[250px] cursor-pointer ${task.assignment_task_uuid === selectedAssignmentTaskUUID ? 'ring-primary ring-2' : ''}`}
              onClick={() => {
                setSelectedTaskUUID(task.assignment_task_uuid);
                setAssignmentTask(task);
              }}
            >
              <CardContent className="px-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="text-gray-500">
                      {task.assignment_type === 'QUIZ' && <ListTodo size={15} />}
                      {task.assignment_type === 'FILE_SUBMISSION' && <FileUp size={15} />}
                      {task.assignment_type === 'FORM' && <Type size={15} />}
                    </span>
                    {task.title}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('openTask')}
                  >
                    <PanelLeftOpen size={16} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AssignmentTasks;
