import AssignmentBoxUI from '@components/Objects/Activities/Assignment/AssignmentBoxUI';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

type ViewType = 'teacher' | 'student' | 'grading' | 'custom-grading';

interface TaskFileObjectProps {
  view: ViewType;
  assignmentTaskUUID?: string;
}

export default function TaskFileObject({ view, assignmentTaskUUID: _assignmentTaskUUID }: TaskFileObjectProps) {
  const t = useTranslations('DashPage.Assignments.TaskFileObject');
  void _assignmentTaskUUID;

  return (
    <AssignmentBoxUI
      showSavingDisclaimer={false}
      view={view}
      type="file"
    >
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{t('teacherViewInfo')}</AlertTitle>
      </Alert>
    </AssignmentBoxUI>
  );
}
