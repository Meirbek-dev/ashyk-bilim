import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, CourseLearner } from '#/shared/api/gen/types.gen'
import { MultiSelectField } from '#/shared/components/form/multi-select-field'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { formatNumber } from '#/shared/i18n/format'

import { accessOptions, courseGroupsOptions } from '../queries'
import { accessLabels, optionsOf } from './labels'
import { useAccessForm } from './use-access-form'
import { isStale } from './use-version'

type AccessSectionProps = { activityId: string; assessment: AssessmentDetail; learners: readonly CourseLearner[] }

const person = (user: { display_name: string; username: string }, id: string) => ({
  value: id,
  label: `${user.display_name} (@${user.username})`,
})

/** "Access": everyone in the course, or chosen learners and course groups; the server counts who gets in. */
export function AccessSection({ activityId, assessment, learners }: AccessSectionProps) {
  const { data: view } = useSuspenseQuery(accessOptions(assessment.id))
  const { data: groups } = useSuspenseQuery(courseGroupsOptions(assessment.course_id))
  const access = useAccessForm(activityId, assessment, view)
  const { form, save } = access
  const stale = isStale(save.error)
  // Chosen people keep their labels even when they are past the learner page.
  const people = [
    ...view.users.map(user => person(user, user.id)),
    ...learners
      .filter(user => !view.users.some(chosen => chosen.id === user.user_id))
      .map(user => person(user, user.user_id)),
  ]
  const groupOptions = [
    ...view.usergroups,
    ...groups.filter(group => !view.usergroups.some(old => old.id === group.id)),
  ]
  return (
    <>
      <SettingsSection
        title={m.assessments_nav_access()}
        description={m.assessments_access_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={save.isPending}
        error={stale ? null : save.error}
      >
        <p className="text-sm">{m.assessments_access_count({ count: formatNumber(view.effective_user_count) })}</p>
        <form.AppField name="mode">
          {field => (
            <field.RadioGroupField label={m.assessments_field_access_mode()} options={optionsOf(accessLabels)} />
          )}
        </form.AppField>
        <form.Subscribe selector={state => state.values.mode}>
          {mode =>
            mode === 'restricted' ? (
              <>
                <form.AppField name="user_ids">
                  {() => <MultiSelectField label={m.assessments_field_learners()} options={people} />}
                </form.AppField>
                <form.AppField name="usergroup_ids">
                  {() => (
                    <MultiSelectField
                      label={m.assessments_field_groups()}
                      options={groupOptions.map(group => ({ value: group.id, label: group.name }))}
                    />
                  )}
                </form.AppField>
              </>
            ) : null
          }
        </form.Subscribe>
      </SettingsSection>
      <ConfirmDialog
        open={access.confirming}
        onOpenChange={access.setConfirming}
        title={m.assessments_access_empty_title()}
        consequence={m.assessments_access_empty_consequence()}
        confirmLabel={m.ui_save()}
        onConfirm={() => void access.send(form.state.values).catch(() => undefined)}
        pending={save.isPending}
        error={stale ? null : save.error}
      />
      <ConflictDialog
        open={access.conflict}
        onOpenChange={access.setConflict}
        onRetry={() => void access.reloadAndRetry()}
        pending={save.isPending}
      />
    </>
  )
}
