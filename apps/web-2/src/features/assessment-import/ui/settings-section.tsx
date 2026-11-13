import { m } from '#/paraglide/messages'
import type { AssessmentImport, CurriculumChapter } from '#/shared/api/gen/types.gen'

import { SETTINGS_ANCHOR } from '../model/issues'
import { NewlinesSwitch } from './newlines-switch'
import { PolicyFields } from './policy-fields'
import { TargetFields } from './target-fields'
import type { CommitFormApi } from './use-commit-form'

/** The switch matters only for a file that has DOT `\n` (or was already read without converting them). */
const hasEscapes = (imported: AssessmentImport) =>
  !imported.unescape_newlines ||
  imported.issues.some(issue => issue.code === 'unescaped_newlines' || issue.code === 'suspicious_escape')

type SettingsSectionProps = {
  form: CommitFormApi
  imported: AssessmentImport
  isNew: boolean
  chapters: readonly CurriculumChapter[]
}

/**
 * Where the questions go and row 1 of the file as editable settings (an existing test takes them only when asked).
 * The target of row-1 issues in the panel.
 */
export function SettingsSection({ form, imported, isNew, chapters }: SettingsSectionProps) {
  const titleId = `${SETTINGS_ANCHOR}-title`
  return (
    <section id={SETTINGS_ANCHOR} tabIndex={-1} aria-labelledby={titleId} className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-lg font-semibold">
          {m.assessment_import_settings_title()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.assessment_import_settings_hint()}</p>
      </div>
      <TargetFields form={form} isNew={isNew} chapters={chapters} />
      <form.Subscribe selector={state => isNew || state.values.apply_settings}>
        {shown =>
          shown ? (
            <PolicyFields
              form={form}
              questions={imported.items.length}
              leveling={imported.settings?.leveling ?? false}
            />
          ) : null
        }
      </form.Subscribe>
      <form.AppField name="map_concepts">
        {field => (
          <field.SwitchField
            label={m.assessment_import_field_concepts()}
            description={m.assessment_import_concepts_hint()}
          />
        )}
      </form.AppField>
      {hasEscapes(imported) ? <NewlinesSwitch imported={imported} /> : null}
    </section>
  )
}
