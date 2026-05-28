'use client'

import {
  CalendarClock,
  GraduationCap,
  Info,
  RefreshCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Shuffle,
  Target,
  Timer,
  UserCheck,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import SecurityShieldBadge from '@/features/assessments/shared/SecurityShieldBadge'
import SaveStateBadge from '@/features/assessments/shared/SaveStateBadge'
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'
import type { classifyValidationIssue } from '@/features/assessments/domain/readiness'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MarkdownEditor } from '@/features/content-markdown'

interface GeneralSettingsTabProps {
  state: AssessmentEditorState
  saveState: SaveState
  disabled: boolean
  issues: ReturnType<typeof classifyValidationIssue>[]
  onChange: (nextState: AssessmentEditorState) => void
}

const ANTI_CHEAT_FEATURES: {
  key: keyof Pick<
    AssessmentEditorState,
    | 'copyPasteProtection'
    | 'tabSwitchDetection'
    | 'devtoolsDetection'
    | 'rightClickDisable'
    | 'fullscreenEnforcement'
  >
  icon: typeof Shield
  labelKey: string
  descKey: string
}[] = [
  {
    key: 'copyPasteProtection',
    icon: ShieldOff,
    labelKey: 'copyPasteProtectionLabel',
    descKey: 'copyPasteProtectionDesc',
  },
  {
    key: 'tabSwitchDetection',
    icon: RefreshCcw,
    labelKey: 'tabSwitchDetectionLabel',
    descKey: 'tabSwitchDetectionDesc',
  },
  {
    key: 'devtoolsDetection',
    icon: ShieldAlert,
    labelKey: 'devtoolsDetectionLabel',
    descKey: 'devtoolsDetectionDesc',
  },
  {
    key: 'rightClickDisable',
    icon: Shield,
    labelKey: 'rightClickDisabledLabel',
    descKey: 'rightClickDisabledDesc',
  },
  {
    key: 'fullscreenEnforcement',
    icon: ShieldCheck,
    labelKey: 'fullscreenEnforcementLabel',
    descKey: 'fullscreenEnforcementDesc',
  },
]

export default function GeneralSettingsTab({
  state,
  saveState,
  disabled,
  issues,
  onChange,
}: GeneralSettingsTabProps) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const tSetup = useTranslations('Features.Assessments.Studio.GeneralSettingsTab')

  const hasIssue = (field: string) => issues.some(issue => issue.field === field)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
      {/* Save indicator */}
      <div className="flex items-center justify-end">
        <SaveStateBadge state={saveState} />
      </div>

      {/* Details Card */}
      <SettingsCard
        icon={GraduationCap}
        title={tSetup('detailsTitle')}
        description={tSetup('detailsDescription')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assessment-title">{t('titleLabel')}</Label>
            <Input
              id="assessment-title"
              value={state.title}
              disabled={disabled}
              aria-invalid={hasIssue('title')}
              className={cn(
                hasIssue('title') && 'border-amber-500 focus-visible:ring-amber-500/40',
              )}
              onChange={e => onChange({ ...state, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assessment-description">{t('descriptionLabel')}</Label>
            <MarkdownEditor
              value={state.description}
              disabled={disabled}
              preset="assessmentDescription"
              minHeight={220}
              onChange={description => onChange({ ...state, description })}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Access & Timing Card */}
      <SettingsCard
        icon={CalendarClock}
        title={tSetup('timingTitle')}
        description={tSetup('timingDescription')}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="assessment-available-from">{tSetup('availableFromLabel')}</Label>
            <Input
              id="assessment-available-from"
              type="datetime-local"
              value={state.availableFrom}
              disabled={disabled}
              onChange={e => onChange({ ...state, availableFrom: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assessment-due-at">{t('dueDateLabel')}</Label>
            <Input
              id="assessment-due-at"
              type="datetime-local"
              value={state.dueAt}
              disabled={disabled}
              aria-invalid={hasIssue('dueAt')}
              className={cn(
                hasIssue('dueAt') && 'border-amber-500 focus-visible:ring-amber-500/40',
              )}
              onChange={e => onChange({ ...state, dueAt: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-max-attempts">{t('attemptLimitLabel')}</Label>
            <Input
              id="exam-max-attempts"
              type="number"
              min={1}
              value={state.maxAttempts}
              disabled={disabled}
              aria-invalid={hasIssue('maxAttempts')}
              className={cn(
                hasIssue('maxAttempts') && 'border-amber-500 focus-visible:ring-amber-500/40',
              )}
              onChange={e => onChange({ ...state, maxAttempts: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exam-time-limit">{t('timeLimitLabel')}</Label>
            <div className="relative">
              <Timer className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="exam-time-limit"
                type="number"
                min={1}
                value={state.timeLimitMinutes}
                disabled={disabled}
                className="pl-9"
                aria-invalid={hasIssue('timeLimitMinutes')}
                onChange={e => onChange({ ...state, timeLimitMinutes: e.target.value })}
              />
            </div>
          </div>
        </div>
        {/* Grace period */}
        <div className="mt-4 max-w-48 space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="exam-grace-period">{tSetup('gracePeriodLabel')}</Label>
            <Tooltip>
              <TooltipTrigger
                render={<Info className="text-muted-foreground size-3.5 cursor-help" />}
              />
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">{tSetup('gracePeriodDesc')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="exam-grace-period"
            type="number"
            min={0}
            value={state.gracePeriodMinutes}
            disabled={disabled}
            onChange={e => onChange({ ...state, gracePeriodMinutes: e.target.value })}
          />
        </div>
      </SettingsCard>

      {/* Grading Card */}
      <SettingsCard
        icon={Target}
        title={tSetup('gradingTitle')}
        description={tSetup('gradingDescription')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="exam-pass-threshold">{tSetup('passThresholdLabel')}</Label>
              <Tooltip>
                <TooltipTrigger
                  render={<Info className="text-muted-foreground size-3.5 cursor-help" />}
                />
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{tSetup('passThresholdDesc')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <Input
                id="exam-pass-threshold"
                type="number"
                min={0}
                max={100}
                value={state.passThreshold}
                disabled={disabled}
                placeholder="60"
                className="pr-8"
                onChange={e => onChange({ ...state, passThreshold: e.target.value })}
              />
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                %
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="exam-negative-marking">{tSetup('negativeMarkingLabel')}</Label>
              <Tooltip>
                <TooltipTrigger
                  render={<Info className="text-muted-foreground size-3.5 cursor-help" />}
                />
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{tSetup('negativeMarkingDesc')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <Input
                id="exam-negative-marking"
                type="number"
                min={0}
                max={100}
                value={state.negativeMarkingPercent}
                disabled={disabled}
                placeholder={tSetup('negativeMarkingPlaceholder')}
                className="pr-8"
                onChange={e => onChange({ ...state, negativeMarkingPercent: e.target.value })}
              />
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                %
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <ToggleFeatureRow
            label={tSetup('partialCreditLabel')}
            description={tSetup('partialCreditDesc')}
            checked={state.partialCredit}
            disabled={disabled}
            onChange={checked => onChange({ ...state, partialCredit: checked })}
          />
        </div>
      </SettingsCard>

      {/* Randomization Card */}
      <SettingsCard
        icon={Shuffle}
        title={tSetup('randomizationTitle')}
        description={tSetup('randomizationDescription')}
      >
        <div className="space-y-3">
          <ToggleFeatureRow
            label={tSetup('randomizeQuestionsLabel')}
            description={tSetup('randomizeQuestionsDesc')}
            checked={state.randomizeQuestions}
            disabled={disabled}
            onChange={checked => onChange({ ...state, randomizeQuestions: checked })}
          />
          <ToggleFeatureRow
            label={tSetup('randomizeOptionsLabel')}
            description={tSetup('randomizeOptionsDesc')}
            checked={state.randomizeOptions}
            disabled={disabled}
            onChange={checked => onChange({ ...state, randomizeOptions: checked })}
          />
        </div>
      </SettingsCard>

      {/* Result Review Card */}
      <SettingsCard
        icon={UserCheck}
        title={tSetup('resultReviewTitle')}
        description={tSetup('resultReviewDescription')}
      >
        <div className="space-y-3">
          <ToggleFeatureRow
            label={t('allowResultReviewLabel')}
            description={tSetup('allowResultReviewDesc')}
            checked={state.allowResultReview}
            disabled={disabled}
            onChange={checked => onChange({ ...state, allowResultReview: checked })}
          />
          <ToggleFeatureRow
            label={t('showCorrectAnswersLabel')}
            description={tSetup('showCorrectAnswersDesc')}
            checked={state.showCorrectAnswers}
            disabled={disabled}
            onChange={checked => onChange({ ...state, showCorrectAnswers: checked })}
          />
        </div>
      </SettingsCard>

      {/* Anti-Cheat / Integrity Suite */}
      <SettingsCard
        icon={ShieldAlert}
        title={tSetup('integrityTitle')}
        description={tSetup('integrityDescription')}
        headerAction={
          <SecurityShieldBadge
            state={{
              copyPasteProtection: state.copyPasteProtection,
              tabSwitchDetection: state.tabSwitchDetection,
              devtoolsDetection: state.devtoolsDetection,
              rightClickDisable: state.rightClickDisable,
              fullscreenEnforcement: state.fullscreenEnforcement,
            }}
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {ANTI_CHEAT_FEATURES.map(({ key, icon: Icon, labelKey, descKey }) => (
            <div
              key={key}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 transition-all duration-200',
                state[key]
                  ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                  : 'bg-card/50 hover:bg-muted/40',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0 transition-colors duration-200',
                  state[key] ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm leading-tight font-medium">{t(labelKey as any)}</span>
                  <Switch
                    checked={state[key]}
                    disabled={disabled}
                    onCheckedChange={checked => onChange({ ...state, [key]: checked })}
                    className="shrink-0"
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{tSetup(descKey as any)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="exam-violation-threshold">{t('violationThresholdLabel')}</Label>
          <div className="flex items-center gap-3">
            <Input
              id="exam-violation-threshold"
              type="number"
              min={1}
              value={state.violationThreshold}
              disabled={disabled}
              className="max-w-32"
              aria-invalid={hasIssue('violationThreshold')}
              onChange={e => onChange({ ...state, violationThreshold: e.target.value })}
            />
            <Tooltip>
              <TooltipTrigger
                render={<Info className="text-muted-foreground size-4 shrink-0 cursor-help" />}
              />
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">{tSetup('violationThresholdDesc')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  headerAction,
  children,
}: {
  icon: typeof Shield
  title: string
  description: string
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-muted mt-0.5 rounded-lg p-2">
            <Icon className="text-muted-foreground size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          </div>
        </div>
        {headerAction}
      </div>
      {children}
    </section>
  )
}

function ToggleFeatureRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="shrink-0"
      />
    </div>
  )
}
