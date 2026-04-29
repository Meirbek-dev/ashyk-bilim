'use client';

import { AlertCircle, Download, File, LoaderCircle, UploadCloud } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AssignmentTaskAnswer } from '@/features/assignments/domain';
import { updateSubFile } from '@services/courses/assignments';
import { getTaskFileSubmissionDir, getTaskRefFileDir } from '@services/media/media';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from '@components/ui/AppLink';

import type { AttemptProps } from '../types';

interface FileAttemptProps extends AttemptProps {
  courseUuid?: string | null;
  activityUuid?: string | null;
  assignmentUuid: string;
}

export default function FileAttempt({
  task,
  answer,
  disabled,
  courseUuid,
  activityUuid,
  assignmentUuid,
  onChange,
}: FileAttemptProps) {
  const [localFileName, setLocalFileName] = useState('');
  const fileKey = answer?.file_key ?? '';

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const res = await updateSubFile({ file, assignmentTaskUUID: task.assignment_task_uuid, assignmentUUID: assignmentUuid });
      if (!res.success || !res.data?.file_uuid) throw new Error(res.data?.detail || 'Upload failed');
      return res.data.file_uuid as string;
    },
    onSuccess: (nextFileKey) => {
      const nextAnswer: AssignmentTaskAnswer = {
        task_uuid: task.assignment_task_uuid,
        content_type: 'file',
        file_key: nextFileKey,
      };
      onChange(nextAnswer);
      toast.success('File attached. Save the draft to keep this change.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Upload failed'),
  });

  const fileUrl =
    fileKey && courseUuid && activityUuid
      ? getTaskFileSubmissionDir({
          courseUUID: courseUuid,
          activityUUID: activityUuid,
          assignmentUUID: assignmentUuid,
          assignmentTaskUUID: task.assignment_task_uuid,
          fileSubID: fileKey,
        })
      : null;

  const referenceUrl =
    task.reference_file && courseUuid && activityUuid
      ? getTaskRefFileDir({
          courseUUID: courseUuid,
          activityUUID: activityUuid,
          assignmentUUID: assignmentUuid,
          assignmentTaskUUID: task.assignment_task_uuid,
          fileID: task.reference_file,
        })
      : null;

  return (
    <div className="space-y-4 rounded-md border bg-muted/30 p-4">
      {referenceUrl ? (
        <Button
          variant="outline"
          render={<Link href={referenceUrl} target="_blank" download />}
        >
          <Download className="size-4" />
          Reference file
        </Button>
      ) : null}

      {fileUrl ? (
        <Button
          variant="outline"
          render={<Link href={fileUrl} target="_blank" />}
        >
          <File className="size-4" />
          Current file
        </Button>
      ) : localFileName ? (
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <File className="size-4" />
          {localFileName}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="file"
          disabled={disabled || uploadMutation.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setLocalFileName(file.name);
            uploadMutation.mutate(file);
          }}
        />
        {uploadMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
      </div>

      <Alert>
        <AlertCircle className="size-4" />
        <AlertDescription>Files are uploaded first, then included in the single assignment draft when you save.</AlertDescription>
      </Alert>
    </div>
  );
}
