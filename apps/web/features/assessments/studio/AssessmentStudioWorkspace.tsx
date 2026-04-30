'use client';

import { AlertTriangle, Archive, CalendarClock, Eye, LoaderCircle, Send, Undo2 } from 'lucide-react';
import { Fragment, useEffect, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { loadKindModule } from '@/features/assessments/registry';
import type { KindModule } from '@/features/assessments/registry';
import { useAssessmentStudio } from '@/features/assessments/hooks/useAssessment';
import type { AssessmentLifecycle } from '@/features/assessments/domain';
import PolicyInspector from '@/features/assessments/shared/PolicyInspector';
import { updateActivity } from '@services/courses/activities';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import Link from '@components/ui/AppLink';
import { cn } from '@/lib/utils';

interface AssessmentStudioWorkspaceProps {
  courseUuid: string;
  activityUuid: string;
}

const LIFECYCLE_LABELS: Record<AssessmentLifecycle, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export default function AssessmentStudioWorkspace({ courseUuid, activityUuid }: AssessmentStudioWorkspaceProps) {
  const { vm, isLoading, error } = useAssessmentStudio(activityUuid);
  const [kindModule, setKindModule] = useState<KindModule | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!vm?.kind) return;
    let cancelled = false;
    setKindModule(null);
    void loadKindModule(vm.kind).then((module) => {
      if (!cancelled) setKindModule(module);
    });
    return () => {
      cancelled = true;
    };
  }, [vm?.kind]);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading studio
      </div>
    );
  }

  if (error || vm?.surface !== 'STUDIO') {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        Studio is unavailable for this activity.
      </div>
    );
  }

  const { vm: studio } = vm;
  const previewHref = `/course/${courseUuid.replace('course_', '')}/activity/${activityUuid.replace('activity_', '')}`;

  const setLifecycle = (lifecycle: AssessmentLifecycle, nextScheduledAt?: string | null) => {
    startTransition(async () => {
      try {
        const metadata = await updateActivity(
          {
            published: lifecycle === 'PUBLISHED',
            details: {
              lifecycle_status: lifecycle,
              scheduled_at: nextScheduledAt ?? null,
            },
          },
          activityUuid,
        );
        if (!metadata.success) {
          const message = (metadata.data as { detail?: string } | undefined)?.detail ?? 'Failed to update lifecycle';
          throw new Error(message);
        }
        await queryClient.invalidateQueries({
          queryKey: queryKeys.activities.detail(activityUuid.replace(/^activity_/, '')),
        });
        toast.success(`Lifecycle changed to ${LIFECYCLE_LABELS[lifecycle]}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update lifecycle');
      }
    });
  };

  // Resolve slots
  const Author = kindModule?.Author;
  const Outline = kindModule?.Outline;
  const Inspector = kindModule?.Inspector;
  const Provider = kindModule?.Provider ?? Fragment;

  const hasOutline = Boolean(Outline);
  const hasInspector = true;

  const slotProps = { activityUuid, courseUuid };

  return (
    <div className="bg-background min-h-screen">
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                <Link
                  href={`/dash/courses/${courseUuid.replace('course_', '')}/curriculum`}
                  className="hover:text-foreground"
                >
                  Curriculum
                </Link>
                <span>/</span>
                <span>{kindModule?.label ?? studio.kind}</span>
                <span>/</span>
                <span>Studio</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="truncate text-xl font-semibold md:text-2xl">{studio.title}</h1>
                <Badge variant={studio.lifecycle === 'PUBLISHED' ? 'default' : 'secondary'}>
                  {LIFECYCLE_LABELS[studio.lifecycle]}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={previewHref}
                    target="_blank"
                  />
                }
              >
                <Eye className="size-4" />
                Preview
              </Button>
              <Input
                type="datetime-local"
                value={scheduledAt}
                disabled={isPending || studio.lifecycle === 'ARCHIVED'}
                className="w-52"
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || !scheduledAt || !studio.canSchedule}
                onClick={() => setLifecycle('SCHEDULED', new Date(scheduledAt).toISOString())}
              >
                <CalendarClock className="size-4" />
                Schedule
              </Button>
              <Button
                size="sm"
                disabled={isPending || !studio.canPublish}
                onClick={() => setLifecycle('PUBLISHED')}
              >
                <Send className="size-4" />
                Publish
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || studio.lifecycle === 'DRAFT' || studio.lifecycle === 'ARCHIVED'}
                onClick={() => setLifecycle('DRAFT')}
              >
                <Undo2 className="size-4" />
                Draft
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || !studio.canArchive}
                onClick={() => setLifecycle('ARCHIVED')}
              >
                <Archive className="size-4" />
                Archive
              </Button>
            </div>
          </div>

          {studio.validationIssues.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="size-4" />
              <AlertDescription>{studio.validationIssues.map((i) => i.message).join(' ')}</AlertDescription>
            </Alert>
          )}
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {Author ? (
        <Provider {...slotProps}>
          <div
            className={cn(
              'grid grid-cols-1',
              hasOutline && !hasInspector && 'lg:grid-cols-[18rem_minmax(0,1fr)]',
              hasOutline &&
                hasInspector &&
                'lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_22rem]',
              !hasOutline && hasInspector && 'xl:grid-cols-[minmax(0,1fr)_22rem]',
            )}
          >
            {Outline && (
              <aside className="border-b lg:border-r lg:border-b-0">
                <Outline {...slotProps} />
              </aside>
            )}
            <main className="min-w-0 border-t lg:border-t-0">
              <Author {...slotProps} />
            </main>
            {hasInspector && (
              <aside className="border-t xl:border-t-0 xl:border-l">
                {Inspector ? (
                  <Inspector {...slotProps} />
                ) : (
                  <PolicyInspector
                    policy={studio.policy}
                    title={`${kindModule?.label ?? 'Assessment'} policy`}
                  />
                )}
              </aside>
            )}
          </div>
        </Provider>
      ) : (
        <div className="text-muted-foreground flex min-h-[360px] items-center justify-center text-sm">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          Loading editor
        </div>
      )}
    </div>
  );
}
