import { m } from '#/paraglide/messages'
import { FieldLegend, FieldSet } from '#/shared/ui/field'

import type { PolicyFormApi } from './use-policy-form'

/** Exam protection: what the attempt watches and how many violations hand it in. */
export function AntiCheatFields({ form }: { form: PolicyFormApi }) {
  return (
    <FieldSet>
      <FieldLegend>{m.assessments_anti_cheat_title()}</FieldLegend>
      <form.AppField name="copy_paste_protection">
        {field => <field.SwitchField label={m.assessments_field_copy_paste()} />}
      </form.AppField>
      <form.AppField name="tab_switch_detection">
        {field => <field.SwitchField label={m.assessments_field_tab_switch()} />}
      </form.AppField>
      <form.AppField name="devtools_detection">
        {field => <field.SwitchField label={m.assessments_field_devtools()} />}
      </form.AppField>
      <form.AppField name="right_click_disabled">
        {field => <field.SwitchField label={m.assessments_field_right_click()} />}
      </form.AppField>
      <form.AppField name="fullscreen_required">
        {field => <field.SwitchField label={m.assessments_field_fullscreen()} />}
      </form.AppField>
      <form.AppField name="violation_threshold">
        {field => (
          <field.TextField
            label={m.assessments_field_violations()}
            description={m.assessments_field_violations_hint()}
            inputMode="numeric"
          />
        )}
      </form.AppField>
    </FieldSet>
  )
}
