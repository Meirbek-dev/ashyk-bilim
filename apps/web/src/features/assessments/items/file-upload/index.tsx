'use client';

import { AlertCircle, Download, File, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { getAssessmentItemSubmissionFileDir, getAssessmentItemFileDir } from '@services/media/media';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from '@components/ui/AppLink';
import { apiFetch } from '@/lib/api-client';

import { registerItemKind } from '../registry';
import type { ItemAuthorProps, ItemAttemptProps, ItemReviewDetailProps } from '../registry';

export interface FileUploadConstraints {
  kind: 'FILE_UPLOAD' | 'FILE_SUBMISSION';
  allowed_mime_types: string[];
  max_file_size_mb: number | null;
  max_files: number;
}

export interface FileUploadAttemptItem {
  taskUuid: string;
  assessmentUuid: string;
  courseUuid?: string | null;
  activityUuid?: string | null;
  referenceFile?: string | null;
  constraints?: FileUploadConstraints;
}

export interface FileUploadAnswer {
  kind?: 'FILE_UPLOAD';
  uploads?: { upload_uuid: string; filename?: string }[];
}

const MIME_TYPE_PRESETS = [
  {
    id: 'pdf',
    mimes: ['application/pdf'],
  },
  {
    id: 'images',
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  {
    id: 'documents',
    mimes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
    ],
  },
  {
    id: 'spreadsheets',
    mimes: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  {
    id: 'presentations',
    mimes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  {
    id: 'archives',
    mimes: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed'],
  },
  {
    id: 'text',
    mimes: ['text/plain', 'text/markdown', 'application/json'],
  },
] as const;

const PRESET_MIME_TYPES: ReadonlySet<string> = new Set(MIME_TYPE_PRESETS.flatMap((preset) => preset.mimes));

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(typeof data?.detail === 'string' ? data.detail : data?.detail?.message || fallback);
  } catch {
    return new Error(fallback);
  }
}

export function normalizeFileUploadConstraints(raw: Record<string, unknown> | null | undefined): FileUploadConstraints {
  return {
    kind: 'FILE_UPLOAD',
    allowed_mime_types: Array.isArray(raw?.allowed_mime_types)
      ? raw.allowed_mime_types.filter((item): item is string => typeof item === 'string')
      : [],
    max_file_size_mb: typeof raw?.max_file_size_mb === 'number' ? raw.max_file_size_mb : null,
    max_files: typeof raw?.max_files === 'number' ? raw.max_files : 1,
  };
}

export function FileUploadConstraintsEditor({ value, disabled, onChange }: ItemAuthorProps<FileUploadConstraints>) {
  const t = useTranslations('Features.Assessments.Items.FileUpload');
  const [customMimeInput, setCustomMimeInput] = useState('');
  const selectedMimeTypes = new Set(value.allowed_mime_types);
  const customMimeTypes = value.allowed_mime_types.filter((mime) => !PRESET_MIME_TYPES.has(mime));

  const updateMimeTypes = (mimes: string[]) => {
    onChange({
      ...value,
      allowed_mime_types: normalizeMimeTypes(mimes),
    });
  };

  const togglePreset = (mimes: readonly string[], checked: boolean) => {
    const next = new Set(value.allowed_mime_types);
    for (const mime of mimes) {
      if (checked) {
        next.add(mime);
      } else {
        next.delete(mime);
      }
    }
    updateMimeTypes([...next]);
  };

  const addCustomMimeTypes = () => {
    const additions = normalizeMimeTypes(customMimeInput.split(/[\s,]+/));
    if (!additions.length) return;
    updateMimeTypes([...value.allowed_mime_types, ...additions]);
    setCustomMimeInput('');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="file-max-files">{t('maxFiles')}</Label>
          <Input
            id="file-max-files"
            type="number"
            min={1}
            value={value.max_files}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, max_files: Math.max(1, Number(event.target.value) || 1) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-max-size">{t('maxSizeMb')}</Label>
          <Input
            id="file-max-size"
            type="number"
            min={1}
            value={value.max_file_size_mb ?? ''}
            placeholder={t('noLimit')}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                max_file_size_mb: event.target.value ? Math.max(1, Number(event.target.value) || 1) : null,
              })
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <Label>{t('allowedFileTypes')}</Label>
            <p className="text-muted-foreground text-xs">{t('fileTypeHint')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || value.allowed_mime_types.length === 0}
            onClick={() => updateMimeTypes([])}
          >
            {t('allowAnyFileType')}
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {MIME_TYPE_PRESETS.map((preset) => {
            const checked = preset.mimes.every((mime) => selectedMimeTypes.has(mime));
            return (
              <label
                key={preset.id}
                className="hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition has-disabled:cursor-not-allowed has-disabled:opacity-60"
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(nextChecked) => togglePreset(preset.mimes, nextChecked === true)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t(`presets.${preset.id}.label` as any)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`presets.${preset.id}.description` as any)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="space-y-2">
          <Label htmlFor="file-mime-types">{t('customMimeLabel')}</Label>
          <div className="flex gap-2">
            <Input
              id="file-mime-types"
              value={customMimeInput}
              placeholder={t('mimePlaceholder')}
              disabled={disabled}
              onChange={(event) => setCustomMimeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                addCustomMimeTypes();
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !customMimeInput.trim()}
              onClick={addCustomMimeTypes}
            >
              {t('addMimeType')}
            </Button>
          </div>
        </div>

        <div className="bg-muted/30 rounded-md border p-3">
          <div className="text-muted-foreground mb-2 text-xs font-medium">{t('selectedTypes')}</div>
          {value.allowed_mime_types.length === 0 ? (
            <p className="text-sm">{t('noTypeRestrictions')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customMimeTypes.map((mime) => (
                <Badge
                  key={mime}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {mime}
                  <button
                    type="button"
                    disabled={disabled}
                    className="hover:bg-background/80 rounded-full p-0.5 disabled:opacity-50"
                    aria-label={t('removeMimeType', { mime })}
                    onClick={() => updateMimeTypes(value.allowed_mime_types.filter((item) => item !== mime))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {MIME_TYPE_PRESETS.filter((preset) => preset.mimes.every((mime) => selectedMimeTypes.has(mime))).map(
                (preset) => (
                  <Badge
                    key={preset.id}
                    variant="outline"
                  >
                    {t(`presets.${preset.id}.label` as any)}
                  </Badge>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileUploadAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<FileUploadAttemptItem, FileUploadAnswer | null>) {
  const t = useTranslations('Features.Assessments.Items.FileUpload');
  const [localFileName, setLocalFileName] = useState('');
  const fileKey = answer?.uploads?.[0]?.upload_uuid ?? '';
  const uploadedLabel = answer?.uploads?.[0]?.filename ?? answer?.uploads?.[0]?.upload_uuid ?? '';

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (item.constraints?.max_file_size_mb && file.size > item.constraints.max_file_size_mb * 1024 * 1024) {
        throw new Error(t('errors.fileTooLarge', { size: item.constraints.max_file_size_mb }));
      }
      if (item.constraints?.allowed_mime_types.length && !item.constraints.allowed_mime_types.includes(file.type)) {
        throw new Error(t('errors.fileTypeNotAllowed'));
      }

      const createResponse = await apiFetch('uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          size: file.size,
        }),
      });
      if (!createResponse.ok) throw await responseError(createResponse, t('errors.uploadCreate'));
      const created = (await createResponse.json()) as { upload_id: string; put_url: string };

      const putResponse = await apiFetch(created.put_url, {
        method: 'PUT',
        headers: file.type ? { 'Content-Type': file.type } : undefined,
        body: file,
        timeoutMs: false,
      });
      if (!putResponse.ok) throw await responseError(putResponse, t('errors.uploadFailed'));

      const digest = await sha256(file);
      const finalizeResponse = await apiFetch(`uploads/${created.upload_id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha256: digest, content_type: file.type }),
      });
      if (!finalizeResponse.ok) throw await responseError(finalizeResponse, t('errors.uploadFinalizeFailed'));
      return { upload_id: created.upload_id, filename: file.name };
    },
    onSuccess: (uploaded) => {
      onAnswerChange({
        kind: 'FILE_UPLOAD',
        uploads: [{ upload_uuid: uploaded.upload_id, filename: uploaded.filename }],
      });
      toast.success(t('toasts.attached'));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errors.uploadFailed')),
  });

  const fileUrl =
    fileKey && item.courseUuid && item.activityUuid
      ? getAssessmentItemSubmissionFileDir({
          courseUUID: item.courseUuid,
          activityUUID: item.activityUuid,
          assessmentUUID: item.assessmentUuid,
          itemUUID: item.taskUuid,
          fileSubID: fileKey,
        })
      : null;

  const referenceUrl =
    item.referenceFile && item.courseUuid && item.activityUuid
      ? getAssessmentItemFileDir({
          courseUUID: item.courseUuid,
          activityUUID: item.activityUuid,
          assessmentUUID: item.assessmentUuid,
          itemUUID: item.taskUuid,
          fileID: item.referenceFile,
        })
      : null;

  return (
    <div className="bg-muted/30 space-y-4 rounded-md border p-4">
      {referenceUrl ? (
        <Button
          variant="outline"
          render={
            <Link
              href={referenceUrl}
              target="_blank"
              download
            />
          }
        >
          <Download className="size-4" />
          {t('referenceFile')}
        </Button>
      ) : null}

      {fileUrl ? (
        <Button
          variant="outline"
          render={
            <Link
              href={fileUrl}
              target="_blank"
            />
          }
        >
          <File className="size-4" />
          {t('currentFile')}
        </Button>
      ) : uploadedLabel ? (
        <div className="bg-background inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <File className="size-4" />
          {uploadedLabel}
        </div>
      ) : localFileName ? (
        <div className="bg-background inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <File className="size-4" />
          {localFileName}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="file"
          accept={item.constraints?.allowed_mime_types.join(',') || undefined}
          disabled={disabled || uploadMutation.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setLocalFileName(file.name);
            uploadMutation.mutate(file);
          }}
        />
        {uploadMutation.isPending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <UploadCloud className="size-4" />
        )}
      </div>

      <Alert>
        <AlertCircle className="size-4" />
        <AlertDescription>{t('verifiedBeforeAttach')}</AlertDescription>
      </Alert>
    </div>
  );
}

export function FileUploadReviewDetail({
  answer,
}: ItemReviewDetailProps<FileUploadAttemptItem, FileUploadAnswer | null>) {
  const t = useTranslations('Features.Assessments.Items.FileUpload');
  return (
    <div className="bg-card rounded-md border p-3 text-sm">
      <div className="font-medium">{t('uploadedFile')}</div>
      <div className="text-muted-foreground mt-1">
        {answer?.uploads?.[0]?.filename ?? answer?.uploads?.[0]?.upload_uuid ?? t('noFileRecorded')}
      </div>
    </div>
  );
}

registerItemKind({
  kind: 'FILE_UPLOAD',
  label: 'File upload',
  Author: FileUploadConstraintsEditor,
  Attempt: FileUploadAttempt,
  ReviewDetail: FileUploadReviewDetail,
});

function normalizeMimeTypes(mimes: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const mime of mimes) {
    const value = mime.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}
