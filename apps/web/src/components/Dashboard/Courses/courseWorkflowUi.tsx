'use client';

import { AlertTriangle, CheckCircle2, CircleDot, Globe, Lock, Sparkles } from 'lucide-react';
import { RadioGroupItem } from '@/components/ui/radio-group';
import type { LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type CourseWorkflowBadgeTone = 'default' | 'info' | 'success' | 'warning' | 'danger';

const courseWorkflowBadgeToneClass: Record<CourseWorkflowBadgeTone, string> = {
  default: 'border-border bg-background text-foreground',
  info: 'border-border bg-muted/70 text-muted-foreground',
  success:
    'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
};

export function getCourseWorkflowToneClass(tone: CourseWorkflowBadgeTone) {
  return courseWorkflowBadgeToneClass[tone];
}

export function CourseWorkflowBadge({
  tone = 'default',
  icon: Icon,
  children,
  className,
}: {
  tone?: CourseWorkflowBadgeTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5', getCourseWorkflowToneClass(tone), className)}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      <span>{children}</span>
    </Badge>
  );
}

export const courseWorkflowCardClass = 'rounded-xl border bg-card shadow-sm';

export function CourseStatusBadge({
  status,
  className,
}: {
  status: 'public' | 'private' | 'ready' | 'needs-review' | 'attention' | 'unsaved' | 'live' | 'draft';
  className?: string;
}) {
  const t = useTranslations('DashPage.CourseManagement.Workflow.status');
  const config = {
    'public': { label: t('public'), tone: 'success' as const, icon: Globe },
    'private': { label: t('private'), tone: 'info' as const, icon: Lock },
    'ready': { label: t('ready'), tone: 'success' as const, icon: CheckCircle2 },
    'needs-review': { label: t('needsReview'), tone: 'warning' as const, icon: AlertTriangle },
    'attention': { label: t('attention'), tone: 'warning' as const, icon: Sparkles },
    'unsaved': { label: t('unsavedChanges'), tone: 'warning' as const, icon: CircleDot },
    'live': { label: t('live'), tone: 'success' as const, icon: Globe },
    'draft': { label: t('draft'), tone: 'info' as const, icon: CircleDot },
  }[status];

  return (
    <CourseWorkflowBadge
      tone={config.tone}
      icon={config.icon}
      className={className}
    >
      {config.label}
    </CourseWorkflowBadge>
  );
}

export function CourseChoiceCard({
  id,
  value,
  checked,
  title,
  description,
  icon: Icon,
  disabled = false,
  onSelect,
}: {
  id: string;
  value: string;
  checked: boolean;
  title: string;
  description: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSelect?: (value: string) => void;
}) {
  return (
    <Label
      htmlFor={id}
      onClick={() => {
        if (!disabled) {
          onSelect?.(value);
        }
      }}
      className={cn(
        'flex cursor-pointer items-start gap-4 rounded-xl border p-5 transition-all duration-150',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        checked
          ? 'border-primary bg-primary/5 text-accent-foreground shadow-sm'
          : 'border-border bg-card text-card-foreground hover:border-muted-foreground/30 hover:bg-muted/40',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <RadioGroupItem
        value={value}
        id={id}
        className="sr-only"
        disabled={disabled}
      />
      <div
        className={cn(
          'mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg border',
          checked ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-foreground text-sm leading-5 font-semibold">{title}</div>
        <div className="text-muted-foreground text-sm leading-5">{description}</div>
      </div>
      <div className={cn('mt-0.5 shrink-0 transition-opacity', checked ? 'opacity-100' : 'opacity-0')}>
        <CheckCircle2 className="text-primary size-5" />
      </div>
    </Label>
  );
}

export const courseWorkflowSummaryCardClass = `${courseWorkflowCardClass} p-5`;
export const courseWorkflowMutedPanelClass = 'rounded-lg border bg-muted/50 p-4';
