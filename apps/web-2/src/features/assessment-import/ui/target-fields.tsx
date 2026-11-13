import { m } from '#/paraglide/messages'
import type { CurriculumChapter } from '#/shared/api/gen/types.gen'

import type { CommitFormApi } from './use-commit-form'

type TargetFieldsProps = { form: CommitFormApi; isNew: boolean; chapters: readonly CurriculumChapter[] }

/** Where the questions go: a new test's chapter and kind, or what happens to an existing test's questions. */
export function TargetFields({ form, isNew, chapters }: TargetFieldsProps) {
  if (!isNew)
    return (
      <>
        <form.AppField name="mode">
          {field => (
            <field.RadioGroupField
              label={m.assessment_import_field_mode()}
              options={[
                {
                  value: 'replace',
                  label: m.assessment_import_mode_replace(),
                  description: m.assessment_import_mode_replace_hint(),
                },
                {
                  value: 'append',
                  label: m.assessment_import_mode_append(),
                  description: m.assessment_import_mode_append_hint(),
                },
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="apply_settings">
          {field => (
            <field.SwitchField
              label={m.assessment_import_field_apply()}
              description={m.assessment_import_apply_hint()}
            />
          )}
        </form.AppField>
      </>
    )
  return (
    <>
      {chapters.length > 0 ? (
        <form.AppField name="chapter_id">
          {field => (
            <field.SelectField
              label={m.assessment_import_field_chapter()}
              options={chapters.map(chapter => ({ value: chapter.id, label: chapter.name }))}
            />
          )}
        </form.AppField>
      ) : (
        <p className="text-sm text-warning">{m.assessment_import_no_chapters()}</p>
      )}
      <form.AppField name="kind">
        {field => (
          <field.RadioGroupField
            label={m.assessment_import_field_kind()}
            options={[
              { value: 'exam', label: m.assessment_import_kind_exam() },
              { value: 'quiz', label: m.assessment_import_kind_quiz() },
            ]}
          />
        )}
      </form.AppField>
    </>
  )
}
