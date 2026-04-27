import { useQueryClient } from '@tanstack/react-query';
import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { createAssignmentTask, type AssignmentType } from '@services/courses/assignments';
import { AArrowUp, FileUp, ListTodo } from 'lucide-react';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface NewTaskModalProps {
  closeModal: (open: boolean) => void;
  assignment_uuid: string;
}

const NewTaskModal = ({ closeModal, assignment_uuid }: NewTaskModalProps) => {
  const t = useTranslations('DashPage.Assignments.NewTaskModal');
  const setSelectedTaskUUID = useAssignmentsTaskStore((s) => s.setSelectedTaskUUID);
  const queryClient = useQueryClient();

  function showReminderToast() {
    // Check if the reminder has already been shown using sessionStorage
    if (sessionStorage.getItem('TasksReminderShown') !== 'true') {
      setTimeout(() => {
        toast(t('reminderToast'), {
          icon: '✋',
          duration: 10_000,
          style: { minWidth: 600 },
        });
        // Mark the reminder as shown in sessionStorage
        sessionStorage.setItem('TasksReminderShown', 'true');
      }, 3000);
    }
  }

  async function createTask(type: AssignmentType) {
    const task_object = {
      title: t('untitledTaskTitle'),
      description: '',
      hint: '',
      reference_file: '',
      assignment_type: type,
      contents: {},
      max_grade_value: 100,
    };
    const res = await createAssignmentTask(task_object, assignment_uuid);
    toast.success(t('createSuccess'));
    showReminderToast();
    await queryClient.invalidateQueries({ queryKey: queryKeys.assignments.tasks(assignment_uuid) });
    setSelectedTaskUUID(res.data.assignment_task_uuid);
    closeModal(false);
  }

  return (
    <div className="mx-auto flex items-center justify-center space-x-6">
      <button
        type="button"
        onClick={() => createTask('QUIZ')}
        className="flex flex-col justify-center space-y-2 pt-10 text-center"
      >
        <div className="soft-shadow mx-auto w-fit rounded-full bg-gray-100/50 px-5 py-5 text-gray-500 transition-all ease-linear hover:bg-gray-100">
          <ListTodo size={30} />
        </div>
        <p className="text-xl font-semibold text-gray-700">{t('quizTitle')}</p>
        <p className="w-40 text-sm text-gray-500">{t('quizDescription')}</p>
      </button>
      <button
        type="button"
        onClick={() => createTask('FILE_SUBMISSION')}
        className="flex flex-col justify-center space-y-2 pt-10 text-center"
      >
        <div className="soft-shadow mx-auto w-fit rounded-full bg-gray-100/50 px-5 py-5 text-gray-500 transition-all ease-linear hover:bg-gray-100">
          <FileUp size={30} />
        </div>
        <p className="text-xl font-semibold text-gray-700">{t('fileSubmissionTitle')}</p>
        <p className="w-40 text-sm text-gray-500">{t('fileSubmissionDescription')}</p>
      </button>
      <button
        type="button"
        onClick={() => createTask('FORM')}
        className="flex flex-col justify-center space-y-2 pt-10 text-center"
      >
        <div className="soft-shadow mx-auto w-fit rounded-full bg-gray-100/50 px-5 py-5 text-gray-500 transition-all ease-linear hover:bg-gray-100">
          <AArrowUp size={30} />
        </div>
        <p className="text-xl font-semibold text-gray-700">{t('formTitle')}</p>
        <p className="w-40 text-sm text-gray-500">{t('formDescription')}</p>
      </button>
    </div>
  );
};

export default NewTaskModal;
