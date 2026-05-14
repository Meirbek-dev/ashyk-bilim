import { apiFetch, errorHandling, getResponseMetadata } from "@/lib/api-client";
import type { CustomResponseTyping } from "@/lib/api-client";
import { getAPIUrl } from "@services/config/config";

export type FileSubmissionAttemptStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "GRADED"
  | "PUBLISHED"
  | "RETURNED";

export interface FileSubmissionAttemptFile {
  attempt_file_uuid: string;
  upload_uuid: string;
  filename: string;
  content_type: string;
  size_bytes?: number | null;
  sha256?: string | null;
  storage_key?: string | null;
  scan_status: "PENDING" | "CLEAN" | "FLAGGED" | "ERROR";
  position: number;
  created_at: string;
}

export interface FileSubmissionAttempt {
  attempt_uuid: string;
  status: FileSubmissionAttemptStatus;
  attempt_number: number;
  files: FileSubmissionAttemptFile[];
  is_late: boolean;
  late_penalty_pct: number;
  final_score?: number | null;
  feedback: { feedback?: string; rubric?: Record<string, unknown> };
  version: number;
  started_at?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: number;
    username: string;
    first_name?: string | null;
    last_name?: string | null;
    email: string;
  } | null;
}

export interface FileSubmissionActivity {
  id: number;
  file_submission_uuid: string;
  activity_id: number;
  activity_uuid: string;
  course_id?: number | null;
  course_uuid?: string | null;
  chapter_id: number;
  title: string;
  instructions: string;
  lifecycle: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  published: boolean;
  allowed_mime_types: string[];
  max_files: number;
  max_file_size_mb?: number | null;
  due_at?: string | null;
  allow_late: boolean;
  max_attempts?: number | null;
  grade_release_mode: "IMMEDIATE" | "BATCH";
  rubric: Record<string, unknown>;
  settings: Record<string, unknown>;
  current_attempt?: FileSubmissionAttempt | null;
  attempts: FileSubmissionAttempt[];
  created_at: string;
  updated_at: string;
}

export interface FileSubmissionCreatePayload {
  title: string;
  instructions: string;
  course_id: number;
  chapter_id: number;
  allowed_mime_types?: string[];
  max_files?: number;
  max_file_size_mb?: number | null;
  due_at?: string | null;
  allow_late?: boolean;
  max_attempts?: number | null;
  grade_release_mode?: "IMMEDIATE" | "BATCH";
}

export type FileSubmissionUpdatePayload = Partial<
  Omit<FileSubmissionCreatePayload, "course_id" | "chapter_id">
>;

export interface FileSubmissionReviewQueue {
  items: FileSubmissionAttempt[];
  total: number;
  page: number;
  page_size: number;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = response.statusText || "Request failed";
  try {
    const payload = await response.json();
    message =
      typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.detail?.message === "string"
          ? payload.detail.message
          : message;
  } catch {
    // keep fallback
  }
  throw new Error(message);
}

export async function getFileSubmissionByActivity(
  activityUuid: string,
): Promise<FileSubmissionActivity> {
  const response = await apiFetch(`file-submissions/activity/${activityUuid}`, {
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  });
  return await errorHandling(response);
}

export async function createFileSubmissionActivity(
  payload: FileSubmissionCreatePayload,
): Promise<CustomResponseTyping> {
  const response = await apiFetch("file-submissions", {
    method: "POST",
    baseUrl: getAPIUrl(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      allowed_mime_types: payload.allowed_mime_types ?? [],
      max_files: payload.max_files ?? 1,
      max_file_size_mb: payload.max_file_size_mb ?? null,
      due_at: payload.due_at ?? null,
      allow_late: payload.allow_late ?? true,
      max_attempts: payload.max_attempts ?? null,
      grade_release_mode: payload.grade_release_mode ?? "IMMEDIATE",
    }),
  });
  const metadata = await getResponseMetadata(response);
  return metadata;
}

export async function updateFileSubmissionActivity(
  fileSubmissionUuid: string,
  payload: FileSubmissionUpdatePayload,
): Promise<FileSubmissionActivity> {
  const response = await apiFetch(`file-submissions/${fileSubmissionUuid}`, {
    method: "PATCH",
    baseUrl: getAPIUrl(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJsonOrThrow<FileSubmissionActivity>(response);
}

export async function publishFileSubmissionActivity(
  fileSubmissionUuid: string,
): Promise<FileSubmissionActivity> {
  const response = await apiFetch(
    `file-submissions/${fileSubmissionUuid}/publish`,
    {
      method: "POST",
      baseUrl: getAPIUrl(),
    },
  );
  return readJsonOrThrow<FileSubmissionActivity>(response);
}

export async function startFileSubmissionDraft(
  fileSubmissionUuid: string,
): Promise<FileSubmissionAttempt> {
  const response = await apiFetch(
    `file-submissions/${fileSubmissionUuid}/draft`,
    { method: "POST" },
  );
  return readJsonOrThrow<FileSubmissionAttempt>(response);
}

export async function saveFileSubmissionDraft(
  fileSubmissionUuid: string,
  files: { upload_uuid: string; display_name?: string }[],
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  const response = await apiFetch(
    `file-submissions/${fileSubmissionUuid}/draft`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(version ? { "If-Match": String(version) } : {}),
      },
      body: JSON.stringify({ files }),
    },
  );
  return readJsonOrThrow<FileSubmissionAttempt>(response);
}

export async function submitFileSubmission(
  fileSubmissionUuid: string,
  files: { upload_uuid: string; display_name?: string }[],
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  const response = await apiFetch(
    `file-submissions/${fileSubmissionUuid}/submit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(version ? { "If-Match": String(version) } : {}),
      },
      body: JSON.stringify({ files }),
    },
  );
  return readJsonOrThrow<FileSubmissionAttempt>(response);
}

export async function uploadSubmissionFile(
  file: File,
): Promise<{ upload_uuid: string; filename: string }> {
  const createResponse = await apiFetch("uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      size: file.size,
    }),
  });
  const created = await readJsonOrThrow<{
    upload_uuid: string;
    put_url: string;
  }>(createResponse);
  const putResponse = await apiFetch(created.put_url, {
    method: "PUT",
    headers: file.type ? { "Content-Type": file.type } : undefined,
    body: file,
    timeoutMs: false,
  });
  await readJsonOrThrow<unknown>(putResponse);
  const digest = await sha256(file);
  const finalizeResponse = await apiFetch(
    `uploads/${created.upload_uuid}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: digest, content_type: file.type }),
    },
  );
  const finalized = await readJsonOrThrow<{ upload_uuid: string }>(
    finalizeResponse,
  );
  return { upload_uuid: finalized.upload_uuid, filename: file.name };
}

export async function getFileSubmissionReviewQueue(
  fileSubmissionUuid: string,
): Promise<FileSubmissionReviewQueue> {
  const response = await apiFetch(
    `file-submissions/${fileSubmissionUuid}/submissions`,
  );
  return readJsonOrThrow<FileSubmissionReviewQueue>(response);
}

export async function getFileSubmissionFileUrl(
  attemptFileUuid: string,
): Promise<{
  attempt_file_uuid: string;
  upload_uuid: string;
  get_url: string;
  expires_at: string;
}> {
  const response = await apiFetch(
    `file-submissions/files/${attemptFileUuid}/url`,
  );
  return readJsonOrThrow(response);
}

export function fileSubmissionExportUrl(fileSubmissionUuid: string): string {
  return `${getAPIUrl()}/file-submissions/${fileSubmissionUuid}/submissions/export`;
}

export async function gradeFileSubmissionAttempt(
  fileSubmissionUuid: string,
  attemptUuid: string,
  payload: {
    final_score?: number | null;
    feedback?: string;
    status: "GRADED" | "PUBLISHED" | "RETURNED";
  },
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  const response = await apiFetch(
    `file-submissions/${fileSubmissionUuid}/submissions/${attemptUuid}/grade`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(version ? { "If-Match": String(version) } : {}),
      },
      body: JSON.stringify({
        final_score: payload.final_score ?? null,
        feedback: payload.feedback ?? "",
        rubric: {},
        status: payload.status,
      }),
    },
  );
  return readJsonOrThrow<FileSubmissionAttempt>(response);
}

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
