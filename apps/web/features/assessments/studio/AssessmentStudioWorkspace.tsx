'use client';

import {
  AlertTriangle,
  Archive,
  CalendarClock,
  ChevronDown,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  PanelRight,
  Send,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { loadKindModule } from '@/features/assessments/registry';
import type { KindModule } from '@/features/assessments/registry';
import { useAssessmentStudio } from '@/features/assessments/hooks/useAssessment';
import type { AssessmentLifecycle } from '@/features/assessments/domain';
import PolicyInspector from '@/features/assessments/shared/PolicyInspector';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { apiFetch } from '@/lib/api-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from '@components/ui/AppLink';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

const LIFECYCLE_BADGE_VARIANT: Record<AssessmentLifecycle, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  DRAFT: 'secondary',
  SCHEDULED: 'outline',
  PUBLISHED: 'default',
  ARCHIVED: 'destructive',
};

export default function AssessmentStudioWorkspace({ courseUuid, activityUuid }: AssessmentStudioWorkspaceProps) {
  const { vm, isLoading, error } = useAssessmentStudio(activityUuid);
  const [kindModule, setKindModule] = useState<KindModule | null>(null);
  const [isPending, startTransition] = useTransition();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const scheduleInputRef = useRef<HTMLInputElement>(null);
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
  const previewHref = `/assessments/${studio.assessmentUuid}`;
  const hasIssues = studio.validationIssues.length > 0;

  const setLifecycle = (lifecycle: AssessmentLifecycle, nextScheduledAt?: string | null) => {
    startTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${studio.assessmentUuid}/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: lifecycle,
            scheduled_at: nextScheduledAt ?? null,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const issues = Array.isArray(payload?.detail?.issues)
            ? payload.detail.issues
                .map((issue: { message?: string }) => issue.message)
                .filter(Boolean)
                .join(' ')
            : '';
          const message =
            issues ||
            (typeof payload?.detail === 'string'
              ? payload.detail
              : response.statusText || 'Failed to update lifecycle');
          throw new Error(message);
        }
        await queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.activity(activityUuid.replace(/^activity_/, '')),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.readiness(studio.assessmentUuid),
        });
        toast.success(`Lifecycle changed to ${LIFECYCLE_LABELS[lifecycle]}`);
        setScheduleOpen(false);
        setScheduledAt('');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update lifecycle');
      }
    });
  };

  // Resolve slots
  const Author = kindModule?.Author;
  const Outline = kindModule?.Outline;
  const Inspector = kindModule?.Inspector;
  const Provider = kindModule?.Provider ?? (({ children }: { children: React.ReactNode }) => <>{children}</>);

  const slotProps = { activityUuid, courseUuid };

  return (
    <div className="bg-background min-h-screen">
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
          {/* Left: breadcrumb + title + lifecycle badge */}
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
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{studio.title}</h1>
              <Badge variant={LIFECYCLE_BADGE_VARIANT[studio.lifecycle]}>{LIFECYCLE_LABELS[studio.lifecycle]}</Badge>
              {hasIssues && (
                <Badge
                  variant="outline"
                  className="border-amber-400 text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="mr-1 size-3" />
                  {studio.validationIssues.length} {studio.validationIssues.length === 1 ? 'issue' : 'issues'}
                </Badge>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
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

            {/* Publish + schedule dropdown */}
            <div className="flex items-center">
              <Button
                size="sm"
                disabled={isPending || !studio.canPublish || hasIssues}
                onClick={() => setLifecycle('PUBLISHED')}
                className="rounded-r-none"
              >
                <Send className="size-4" />
                Publish now
              </Button>
              <Popover
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
              >
                <PopoverTrigger
                  nativeButton
                  render={
                    <Button
                      size="sm"
                      variant="default"
                      disabled={isPending || studio.lifecycle === 'ARCHIVED'}
                      className="rounded-l-none border-l border-l-white/20 px-2"
                      aria-label="Schedule options"
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  }
                />
                <PopoverContent
                  align="end"
                  className="w-64 space-y-3 p-3"
                >
                  <p className="text-sm font-medium">Schedule publication</p>
                  <input
                    ref={scheduleInputRef}
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={isPending || !scheduledAt || !studio.canSchedule}
                    onClick={() => setLifecycle('SCHEDULED', new Date(scheduledAt).toISOString())}
                  >
                    <CalendarClock className="mr-1 size-4" />
                    Schedule
                  </Button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Save as draft (when published/scheduled) */}
            {(studio.lifecycle === 'PUBLISHED' || studio.lifecycle === 'SCHEDULED') && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setLifecycle('DRAFT')}
              >
                <Undo2 className="size-4" />
                Save as draft
              </Button>
            )}

            {/* Overflow: archive */}
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isPending || !studio.canArchive}
                  onSelect={() => setLifecycle('ARCHIVED')}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="mr-2 size-4" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Inspector toggle */}
            <Button
              variant={inspectorOpen ? 'secondary' : 'outline'}
              size="sm"
              aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
              onClick={() => setInspectorOpen((v) => !v)}
            >
              <PanelRight className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {Author ? (
        <Provider {...slotProps}>
          <div className={cn('grid grid-cols-1', inspectorOpen && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
            <main className="min-w-0">
              <Author {...slotProps} />
            </main>

            {inspectorOpen && (
              <aside className="space-y-4 border-l p-4">
                {Outline ? (
                  <section>
                    <Outline {...slotProps} />
                  </section>
                ) : null}

                {/* Lifecycle preflight — always shown when issues exist */}
                {hasIssues && (
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                    <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-amber-900 dark:text-amber-200">
                      <p className="mb-1 text-sm font-medium">
                        {studio.validationIssues.length}{' '}
                        {studio.validationIssues.length === 1 ? 'issue blocks' : 'issues block'} publishing:
                      </p>
                      <ul className="space-y-1">
                        {studio.validationIssues.map((issue, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm"
                          >
                            <span>·</span>
                            <span className="flex-1">{issue.message}</span>
                            {issue.itemUuid ? (
                              <a
                                href={`#item-${issue.itemUuid}`}
                                className="shrink-0 text-xs text-amber-700 underline dark:text-amber-300"
                              >
                                Jump to question
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

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
