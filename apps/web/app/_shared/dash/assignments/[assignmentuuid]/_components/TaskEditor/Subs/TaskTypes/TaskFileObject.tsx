import {
  getAssignmentTask,
  getAssignmentTaskSubmissionsMe,
  getAssignmentTaskSubmissionsUser,
  handleAssignmentTaskSubmission,
  updateSubFile,
} from '@services/courses/assignments';
import { useAssignmentsTaskStore } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { AlertCircle, Cloud, Download, File, Info, Loader2, UploadCloud } from 'lucide-react';
import AssignmentBoxUI from '@components/Objects/Activities/Assignment/AssignmentBoxUI';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { useSession } from '@/hooks/useSession';
import { getTaskFileSubmissionDir } from '@services/media/media';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { toast } from 'sonner';

// shadcn/ui
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ================= Types =================
type ViewType = 'teacher' | 'student' | 'grading' | 'custom-grading';

interface FileSubmission {
  fileUUID: string;
  assignment_task_submission_uuid?: string;
}

interface AssignmentTask {
  assignment_task_uuid: string;
  max_grade_value: number;
  contents?: { questions?: unknown[] };
}

interface UserSubmissionObject {
  grade: number;
  task_submission: FileSubmission;
  assignment_task_submission_uuid: string;
}

interface TaskFileObjectProps {
  view: ViewType;
  assignmentTaskUUID?: string;
  user_id?: number;
}

interface Assignment {
  assignment_object: { assignment_uuid: string };
  course_object: { course_uuid: string };
  activity_object: { activity_uuid: string };
}

// ================= Constants =================
const UPLOAD_DELAY_MS = 1500;
const MAX_FILENAME_LENGTH = 20;
const UUID_PREVIEW_START = 8;
const UUID_PREVIEW_END = 4;

// ================= Render helpers =================
const FileCard = ({ label }: { label: string }) => (
  <Card className="relative w-full sm:w-auto">
    <CardContent className="flex items-center gap-2 py-4">
      <Badge className="absolute top-2 right-2 rounded-full bg-emerald-600 p-1 shadow-sm">
        <Cloud
          className="text-white"
          size={16}
        />
      </Badge>
      <File
        className="text-emerald-500"
        size={18}
      />
      <span className="text-xs font-medium break-all uppercase sm:text-sm">{label}</span>
    </CardContent>
  </Card>
);

// ================= Utils =================
const truncateFilename = (filename: string): string => {
  if (filename.length <= MAX_FILENAME_LENGTH) return filename;
  const half = MAX_FILENAME_LENGTH / 2;
  return `${filename.slice(0, half)}...${filename.slice(-half)}`;
};

const formatUUID = (uuid: string): string => `${uuid.slice(0, UUID_PREVIEW_START)}...${uuid.slice(-UUID_PREVIEW_END)}`;

// ================= Component =================
export default function TaskFileObject({ view, user_id, assignmentTaskUUID }: TaskFileObjectProps) {
  const t = useTranslations('DashPage.Assignments.TaskFileObject');
  const { user: viewer } = useSession();
  usePlatform();
  const assignment = useAssignments() as Assignment | null;
  const reload = useAssignmentsTaskStore((s) => s.reload);
  const username = viewer?.username;

  const [isLoading, setIsLoading] = useState(false);
  const [localUploadFile, setLocalUploadFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignmentTask, setAssignmentTask] = useState<AssignmentTask | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<FileSubmission>({ fileUUID: '' });
  const [initialUserSubmissions, setInitialUserSubmissions] = useState<FileSubmission>({
    fileUUID: '',
  });
  const [userSubmissionObject, setUserSubmissionObject] = useState<UserSubmissionObject | null>(null);

  const showSavingDisclaimer = userSubmissions.fileUUID !== initialUserSubmissions.fileUUID;

  const assignmentUUID = assignment?.assignment_object?.assignment_uuid;
  const courseUUID = assignment?.course_object?.course_uuid;
  const activityUUID = assignment?.activity_object?.activity_uuid;

  // ================= Handlers =================
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!assignmentTaskUUID || !assignmentUUID) {
      setError(t('missingAssignmentInfo'));
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setLocalUploadFile(file);
    setIsLoading(true);
    setError(null);

    try {
      const res = await updateSubFile({
        file,
        assignmentTaskUUID,
        assignmentUUID,
      });

      if (!res.success) {
        setError(res.data?.detail || t('uploadFailed'));
        return;
      }

      reload();
      setUserSubmissions({
        fileUUID: res.data.file_uuid,
        assignment_task_submission_uuid: res.data.assignment_task_submission_uuid,
      });
    } catch (error) {
      setError(t('uploadUnexpectedError'));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitFile = async (): Promise<void> => {
    if (!assignmentTaskUUID || !assignmentUUID) {
      toast.error(t('missingAssignmentInfo'));
      return;
    }

    const values = {
      assignment_task_submission_uuid: userSubmissions.assignment_task_submission_uuid || null,
      task_submission: userSubmissions,
      grade: 0,
      task_submission_grade_feedback: '',
    };

    try {
      const res = await handleAssignmentTaskSubmission({
        body: values,
        assignmentTaskUUID,
        assignmentUUID,
      });
      if (!res) {
        toast.error(t('errorSaving'));
        return;
      }

      reload();
      toast.success(t('saveSuccess'));

      const updated = {
        ...userSubmissions,
        assignment_task_submission_uuid:
          res.data?.assignment_task_submission_uuid || userSubmissions.assignment_task_submission_uuid,
      };
      setUserSubmissions(updated);
      setInitialUserSubmissions(updated);
    } catch (error) {
      toast.error(t('errorSaving'));
      console.error(error);
    }
  };

  const gradeSubmission = async (grade: number): Promise<void> => {
    if (!assignmentTaskUUID || !assignmentUUID || !assignmentTask || !username) {
      toast.error(t('missingGradingInfo'));
      return;
    }
    if (grade < 0 || grade > 100) {
      toast.error(t('gradeRangeError', { maxGradeValue: 100 }));
      return;
    }

    const values = {
      assignment_task_submission_uuid: userSubmissions.assignment_task_submission_uuid,
      task_submission: userSubmissions,
      grade,
      task_submission_grade_feedback: t('gradedByTeacher', { username }),
    };

    try {
      const res = await handleAssignmentTaskSubmission({
        body: values,
        assignmentTaskUUID,
        assignmentUUID,
      });
      if (!res) {
        toast.error(t('gradeError'));
        return;
      }
      await fetchUserSubmission();
      toast.success(t('gradeSuccess', { grade }));
    } catch (error) {
      toast.error(t('gradeError'));
      console.error(error);
    }
  };

  // ================= Fetching =================
  async function fetchUserSubmission() {
    if (!assignmentTaskUUID || !assignmentUUID || !user_id) return;
    const res = await getAssignmentTaskSubmissionsUser({
      assignmentTaskUUID,
      user_id,
      assignmentUUID,
    });
    if (res.success && res.data?.task_submission) {
      const sub = {
        ...res.data.task_submission,
        assignment_task_submission_uuid: res.data.assignment_task_submission_uuid,
      };
      setUserSubmissions(sub);
      setInitialUserSubmissions(sub);
      setUserSubmissionObject(res.data);
    } else {
      setUserSubmissions({ fileUUID: '' });
      setInitialUserSubmissions({ fileUUID: '' });
      setUserSubmissionObject(null);
    }
  }

  const fetchStudentView = useCallback(async () => {
    if (assignmentTaskUUID) {
      const res = await getAssignmentTask(assignmentTaskUUID);
      if (res.success && res.data) setAssignmentTask(res.data);
    }

    if (assignmentTaskUUID && assignmentUUID) {
      const res = await getAssignmentTaskSubmissionsMe(assignmentTaskUUID, assignmentUUID);
      if (res.success && res.data?.task_submission) {
        const sub = {
          ...res.data.task_submission,
          assignment_task_submission_uuid: res.data.assignment_task_submission_uuid,
        };
        setUserSubmissions(sub);
        setInitialUserSubmissions(sub);
      } else {
        setUserSubmissions({ fileUUID: '' });
        setInitialUserSubmissions({ fileUUID: '' });
      }
    }
  }, [assignmentTaskUUID, assignmentUUID]);

  const fetchCustomGradingView = useCallback(async () => {
    if (assignmentTaskUUID) {
      const res = await getAssignmentTask(assignmentTaskUUID);
      if (res.success && res.data) setAssignmentTask(res.data);
    }

    if (assignmentTaskUUID && assignmentUUID && user_id) {
      const res = await getAssignmentTaskSubmissionsUser({
        assignmentTaskUUID,
        user_id,
        assignmentUUID,
      });
      if (res.success && res.data?.task_submission) {
        const sub = {
          ...res.data.task_submission,
          assignment_task_submission_uuid: res.data.assignment_task_submission_uuid,
        };
        setUserSubmissions(sub);
        setInitialUserSubmissions(sub);
        setUserSubmissionObject(res.data);
      } else {
        setUserSubmissions({ fileUUID: '' });
        setInitialUserSubmissions({ fileUUID: '' });
        setUserSubmissionObject(null);
      }
    }
  }, [assignmentTaskUUID, assignmentUUID, user_id]);

  useEffect(() => {
    const loadIfNeeded = async () => {
      setIsLoading(true);
      try {
        if (view === 'student') {
          await fetchStudentView();
        } else if (view === 'custom-grading') {
          await fetchCustomGradingView();
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadIfNeeded();
  }, [view, assignmentTaskUUID, assignmentUUID, user_id, fetchStudentView, fetchCustomGradingView]);

  // ================= Render helpers =================
  const renderTeacherView = () => (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>{t('teacherViewInfo')}</AlertTitle>
    </Alert>
  );

  const renderGradingView = () => {
    if (!userSubmissions.fileUUID || isLoading || !assignmentTaskUUID) return null;
    if (!courseUUID || !activityUUID || !assignmentUUID) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t('missingCourseInfo')}</AlertDescription>
        </Alert>
      );
    }

    const fileUrl = getTaskFileSubmissionDir({
      courseUUID,
      activityUUID,
      assignmentUUID,
      assignmentTaskUUID,
      fileSubID: userSubmissions.fileUUID,
    });

    return (
      <div className="space-y-3">
        <Alert>
          <Download className="h-4 w-4" />
          <AlertTitle>{t('gradingViewInfo')}</AlertTitle>
        </Alert>
        <Link
          href={fileUrl}
          target="_blank"
        >
          <FileCard label={formatUUID(userSubmissions.fileUUID)} />
        </Link>
      </div>
    );
  };

  const renderStudentView = () => (
    <Card className="min-h-[200px]">
      <CardContent className="flex flex-col items-center gap-4 py-6">
        {error && (
          <Alert
            variant="destructive"
            className="w-full sm:w-auto"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {localUploadFile && !isLoading && <FileCard label={truncateFilename(localUploadFile.name)} />}
        {userSubmissions.fileUUID && !isLoading && !localUploadFile && (
          <FileCard label={formatUUID(userSubmissions.fileUUID)} />
        )}

        <Alert className="w-full sm:w-auto">
          <Info className="h-4 w-4" />
          <AlertDescription>{t('allowedFormats')}</AlertDescription>
        </Alert>

        {isLoading ? (
          <Button
            disabled
            variant="secondary"
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('loading')}
          </Button>
        ) : (
          <>
            <Input
              type="file"
              id={`fileInput_${assignmentTaskUUID}`}
              className="hidden"
              onChange={handleFileChange}
              aria-label={t('ariaLabel')}
              title={t('selectFile')}
            />
            <Button onClick={() => document.getElementById(`fileInput_${assignmentTaskUUID}`)?.click()}>
              <UploadCloud className="mr-2 h-4 w-4" />
              {t('submitFile')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  // ================= Main =================
  return (
    <AssignmentBoxUI
      submitFC={submitFile}
      showSavingDisclaimer={showSavingDisclaimer}
      view={view}
      gradeCustomFC={gradeSubmission}
      currentPoints={userSubmissionObject?.grade}
      maxPoints={assignmentTask?.max_grade_value}
      type="file"
    >
      {view === 'teacher' && renderTeacherView()}
      {view === 'custom-grading' && renderGradingView()}
      {view === 'student' && renderStudentView()}
    </AssignmentBoxUI>
  );
}
