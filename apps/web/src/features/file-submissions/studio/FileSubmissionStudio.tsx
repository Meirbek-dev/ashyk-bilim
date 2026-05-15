"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Eye,
  Loader2,
  Save,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "@components/ui/AppLink";
import {
  getFileSubmissionByActivity,
  publishFileSubmissionActivity,
  updateFileSubmissionActivity,
} from "@/features/file-submissions/services/file-submissions";
import { getFriendlyMimeName } from "@/lib/file-validation";

interface FileSubmissionStudioProps {
  courseUuid: string;
  activityUuid: string;
}

const queryKey = (activityUuid: string) =>
  ["file-submission", "studio", activityUuid] as const;

export default function FileSubmissionStudio({
  courseUuid,
  activityUuid,
}: FileSubmissionStudioProps) {
  const cleanActivityUuid = activityUuid.replace(/^activity_/, "");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [maxFiles, setMaxFiles] = useState(1);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number | "">("");

  const { data, isLoading, error } = useQuery({
    queryKey: queryKey(cleanActivityUuid),
    queryFn: () => getFileSubmissionByActivity(cleanActivityUuid),
    enabled: Boolean(cleanActivityUuid),
  });

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setInstructions(data.instructions);
    setDueAt(data.due_at ? toDateTimeLocal(data.due_at) : "");
    setMaxFiles(data.max_files);
    setMaxFileSizeMb(data.max_file_size_mb ?? "");
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("File submission is unavailable");
      return await updateFileSubmissionActivity(data.file_submission_uuid, {
        title,
        instructions,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        max_files: maxFiles,
        max_file_size_mb: maxFileSizeMb === "" ? null : maxFileSizeMb,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKey(cleanActivityUuid),
      });
      toast.success("File submission saved");
    },
    onError: (saveError) => {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save file submission",
      );
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("File submission is unavailable");
      return await publishFileSubmissionActivity(data.file_submission_uuid);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKey(cleanActivityUuid),
      });
      toast.success("File submission published");
    },
    onError: (publishError) => {
      toast.error(
        publishError instanceof Error
          ? publishError.message
          : "Unable to publish file submission",
      );
    },
  });

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading file submission studio
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        Studio is unavailable.
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="min-w-0">
            <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
              <Link
                href={`/dash/courses/${courseUuid.replace("course_", "")}/curriculum`}
                className="hover:text-foreground"
              >
                Curriculum
              </Link>
              <span>/</span>
              <span>File Submission</span>
              <span>/</span>
              <span>Studio</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{data.title}</h1>
              <Badge
                variant={
                  data.lifecycle === "PUBLISHED" ? "default" : "secondary"
                }
              >
                {data.lifecycle}
              </Badge>
              {data.due_at ? (
                <Badge variant="outline">
                  <CalendarClock className="mr-1 size-3" />
                  {formatDate(data.due_at)}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`/course/${courseUuid.replace("course_", "")}/activity/${cleanActivityUuid}`}
                />
              }
            >
              <Eye className="size-4" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || publishMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => publishMutation.mutate()}
              disabled={
                publishMutation.isPending ||
                saveMutation.isPending ||
                !title.trim() ||
                !instructions.trim()
              }
            >
              {publishMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Publish
            </Button>
          </div>
        </div>
      </header>

      <main className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
        <form onSubmit={save} className="space-y-5">
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field>
            <FieldLabel>Instructions</FieldLabel>
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              className="min-h-52"
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>Due date</FieldLabel>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Max files</FieldLabel>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxFiles}
                onChange={(event) => setMaxFiles(Number(event.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel>Max size MB</FieldLabel>
              <Input
                type="number"
                min={1}
                value={maxFileSizeMb}
                onChange={(event) =>
                  setMaxFileSizeMb(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
              />
            </Field>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="rounded-md border p-4">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="text-muted-foreground size-4" />
              <h2 className="text-sm font-semibold">Collection rules</h2>
            </div>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Attempts</dt>
                <dd>{data.max_attempts ?? "Unlimited"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Late work</dt>
                <dd>{data.allow_late ? "Allowed" : "Blocked"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Allowed files</dt>
                <dd>
                  {data.allowed_mime_types.length > 0
                    ? data.allowed_mime_types.map(getFriendlyMimeName).join(", ")
                    : "Any file type"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-md border p-4">
            <h2 className="mb-3 text-sm font-semibold">Review</h2>
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={
                <Link
                  href={`/dash/courses/${courseUuid.replace("course_", "")}/activity/${cleanActivityUuid}/review`}
                />
              }
            >
              Open submissions
            </Button>
          </section>
        </aside>
      </main>
    </div>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
