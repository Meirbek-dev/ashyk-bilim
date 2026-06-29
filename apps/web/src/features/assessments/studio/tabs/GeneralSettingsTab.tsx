'use client'

import {
  AlertTriangle,
  CalendarClock,
  Eye,
  GraduationCap,
  Info,
  ListChecks,
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
import { CalendarDateTimePicker } from '@/components/ui/calendar'
import { applyResultReleasePolicy, getPolicyWarningCodes, resultReleasePolicyFromState } from './policyWarnings'
import type { PolicyWarningCode, ResultReleasePolicy } from './policyWarnings'

interface GeneralSettingsTabProps {
  state: AssessmentEditorState
  saveState: SaveState
  disabled: boolean
  issues: ReturnType<typeof classifyValidationIssue>[]
  onChange: (nextState: AssessmentEditorState) => void
}

const INTEGRITY_CONTROLS: {
  key: keyof Pick<
    AssessmentEditorState,
    'copyPasteProtection' | 'tabSwitchDetection' | 'devtoolsDetection' | 'rightClickDisable' | 'fullscreenEnforcement'
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

export default function GeneralSettingsTab({ state, saveState, disabled, issues, onChange }: GeneralSettingsTabProps) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const tSetup = useTranslations('Features.Assessments.Studio.GeneralSettingsTab')

  const hasIssue = (field: string) => issues.some(issue => issue.field === field)
  const releasePolicy = resultReleasePolicyFromState(state)
  const warningCodes = getPolicyWarningCodes(state)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
      {/* Save indicator */}
      <div className="flex items-center justify-end">
        <SaveStateBadge state={saveState} />
      </div>

      <PolicyImpactSummary state={state} releasePolicy={releasePolicy} />
      {warningCodes.length > 0 ? <PolicyWarningList codes={warningCodes} /> : null}

      {/* Details Card */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]">
        <div className="space-y-5">
          <SettingsCard icon={GraduationCap} title={tSetup('detailsTitle')} description={tSetup('detailsDescription')}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assessment-title">{t('titleLabel')}</Label>
                <Input
                  id="assessment-title"
                  value={state.title}
                  disabled={disabled}
                  aria-invalid={hasIssue('title')}
                  className={cn(hasIssue('title') && 'border-amber-500 focus-visible:ring-amber-500/40')}
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

          <SettingsCard icon={CalendarClock} title={tSetup('timingTitle')} description={tSetup('timingDescription')}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="assessment-available-from">{tSetup('availableFromLabel')}</Label>
                <CalendarDateTimePicker
                  id="assessment-available-from"
                  value={state.availableFrom}
                  onChange={availableFrom => onChange({ ...state, availableFrom })}
                  disabled={disabled}
                  placeholder={tSetup('availableFromLabel')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessment-due-at">{t('dueDateLabel')}</Label>
                <CalendarDateTimePicker
                  id="assessment-due-at"
                  value={state.dueAt}
                  onChange={dueAt => onChange({ ...state, dueAt })}
                  disabled={disabled}
                  className={cn(hasIssue('dueAt') && 'border-amber-500 focus-visible:ring-amber-500/40')}
                  placeholder={t('dueDateLabel')}
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
                  className={cn(hasIssue('maxAttempts') && 'border-amber-500 focus-visible:ring-amber-500/40')}
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
                  <TooltipTrigger render={<Info className="text-muted-foreground size-3.5 cursor-help" />} />
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
        </div>

        <div className="space-y-5">
          <SettingsCard icon={Target} title={tSetup('gradingTitle')} description={tSetup('gradingDescription')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="exam-pass-threshold">{tSetup('passThresholdLabel')}</Label>
                  <Tooltip>
                    <TooltipTrigger render={<Info className="text-muted-foreground size-3.5 cursor-help" />} />
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
                  <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="exam-negative-marking">{tSetup('negativeMarkingLabel')}</Label>
                  <Tooltip>
                    <TooltipTrigger render={<Info className="text-muted-foreground size-3.5 cursor-help" />} />
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
                  <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">%</span>
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

          <SettingsCard
            icon={UserCheck}
            title={tSetup('resultReviewTitle')}
            description={tSetup('resultReviewDescription')}
          >
            <ReviewVisibilityControl
              value={releasePolicy}
              disabled={disabled}
              onChange={nextPolicy => onChange(applyResultReleasePolicy(state, nextPolicy))}
            />
          </SettingsCard>
        </div>
      </div>

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
          {INTEGRITY_CONTROLS.map(({ key, icon: Icon, labelKey, descKey }) => (
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
                  <span className="text-sm leading-tight font-medium">{t(labelKey)}</span>
                  <Switch
                    checked={state[key]}
                    disabled={disabled}
                    onCheckedChange={checked => onChange({ ...state, [key]: checked })}
                    className="shrink-0"
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{tSetup(descKey)}</p>
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
              <TooltipTrigger render={<Info className="text-muted-foreground size-4 shrink-0 cursor-help" />} />
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">{tSetup('violationThresholdDesc')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="bg-muted/40 mt-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <ListChecks className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">{tSetup('accessibilityExceptionsTitle')}</p>
              <p className="text-muted-foreground mt-1 text-xs">{tSetup('accessibilityExceptionsDescription')}</p>
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}

function PolicyImpactSummary({
  state,
  releasePolicy,
}: {
  state: AssessmentEditorState
  releasePolicy: ResultReleasePolicy
}) {
  const tSetup = useTranslations('Features.Assessments.Studio.GeneralSettingsTab')
  const timing = state.timeLimitMinutes
    ? tSetup('summaryTimed', { minutes: state.timeLimitMinutes })
    : tSetup('summaryUntimed')
  const attempts = state.maxAttempts
    ? tSetup('summaryAttempts', { count: state.maxAttempts })
    : tSetup('summaryUnlimitedAttempts')
  const release = tSetup(`releasePolicy.${releasePolicy}.summary`)
  const integrityEnabled =
    state.copyPasteProtection ||
    state.tabSwitchDetection ||
    state.devtoolsDetection ||
    state.rightClickDisable ||
    state.fullscreenEnforcement

  return (
    <section className="bg-card rounded-lg border p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="text-muted-foreground size-4" />
        <h3 className="text-sm font-semibold">{tSetup('impactTitle')}</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ImpactPill label={tSetup('impactTiming')} value={timing} />
        <ImpactPill label={tSetup('impactAttempts')} value={attempts} />
        <ImpactPill label={tSetup('impactRelease')} value={release} />
        <ImpactPill
          label={tSetup('impactIntegrity')}
          value={integrityEnabled ? tSetup('summaryIntegrityOn') : tSetup('summaryIntegrityOff')}
        />
      </div>
    </section>
  )
}

function ImpactPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-[11px] font-medium uppercase">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function PolicyWarningList({ codes }: { codes: PolicyWarningCode[] }) {
  const tSetup = useTranslations('Features.Assessments.Studio.GeneralSettingsTab')
  return (
    <section className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-100">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="size-4" />
        <h3 className="text-sm font-semibold">{tSetup('warningsTitle')}</h3>
      </div>
      <ul className="space-y-1 text-sm">
        {codes.map(code => (
          <li key={code}>{tSetup(`warnings.${code}`)}</li>
        ))}
      </ul>
    </section>
  )
}

function ReviewVisibilityControl({
  value,
  disabled,
  onChange,
}: {
  value: ResultReleasePolicy
  disabled: boolean
  onChange: (value: ResultReleasePolicy) => void
}) {
  const tSetup = useTranslations('Features.Assessments.Studio.GeneralSettingsTab')
  const options: ResultReleasePolicy[] = ['NONE', 'SCORE_ONLY', 'FULL']

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {options.map(option => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            value === option ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted/50',
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <Eye className="text-muted-foreground size-4" />
            <p className="text-sm font-semibold">{tSetup(`releasePolicy.${option}.title`)}</p>
          </div>
          <p className="text-muted-foreground text-xs">{tSetup(`releasePolicy.${option}.description`)}</p>
        </button>
      ))}
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
    <section className="bg-card rounded-lg border p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-muted mt-0.5 rounded-md p-2">
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
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} className="shrink-0" />
    </div>
  )
}
