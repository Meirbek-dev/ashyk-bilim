import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import TaskQuizObject from './TaskTypes/TaskQuizObject';
import TaskFormObject from './TaskTypes/TaskFormObject';
import TaskFileObject from './TaskTypes/TaskFileObject';

const AssignmentTaskContentEdit = () => {
  const assignmentTask = useAssignmentsTaskStore((s) => s.assignmentTask);

  return (
    <div>
      {assignmentTask.assignment_type === 'QUIZ' && (
        <TaskQuizObject assignmentTaskUUID={assignmentTask.assignment_task_uuid} />
      )}
      {assignmentTask.assignment_type === 'FILE_SUBMISSION' && (
        <TaskFileObject
          view="teacher"
          assignmentTaskUUID={assignmentTask.assignment_task_uuid}
        />
      )}
      {assignmentTask.assignment_type === 'FORM' && (
        <TaskFormObject assignmentTaskUUID={assignmentTask.assignment_task_uuid ?? ''} />
      )}
    </div>
  );
};

export default AssignmentTaskContentEdit;
