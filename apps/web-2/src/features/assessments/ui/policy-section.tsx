import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'

import { hasAntiCheat } from '../model/policy'
import { AntiCheatFields } from './anti-cheat-fields'
import { GradingFields } from './grading-fields'
import { TimingFields } from './timing-fields'
import { usePolicyForm } from './use-policy-form'
import { isStale } from './use-version'

type PolicySectionProps = { activityId: string; assessment: AssessmentDetail }

/** "Rules": the policy block with its own Save; an exam adds its protection. */
export function PolicySection({ activityId, assessment }: PolicySectionProps) {
  const { form, save, version } = usePolicyForm(activityId, assessment)
  return (
    <>
      <SettingsSection
        title={m.assessments_nav_rules()}
        description={m.assessments_rules_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={save.isPending}
        error={isStale(save.error) ? null : save.error}
      >
        <TimingFields form={form} />
        <GradingFields form={form} />
        {hasAntiCheat(assessment.kind) ? <AntiCheatFields form={form} /> : null}
      </SettingsSection>
      <ConflictDialog
        open={version.conflict}
        onOpenChange={version.setConflict}
        onRetry={() => void version.reload().then(() => form.handleSubmit())}
        pending={save.isPending}
      />
    </>
  )
}
