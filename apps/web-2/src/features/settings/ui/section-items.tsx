import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { SkillLevel } from '#/shared/api/gen/types.gen'

import type { SectionType } from '../model/profile-sections'
import { ItemList } from './item-list'
import type { BuilderForm } from './profile-builder'

export const skillLevelLabels = {
  beginner: m.settings_level_beginner,
  intermediate: m.settings_level_intermediate,
  advanced: m.settings_level_advanced,
  expert: m.settings_level_expert,
} satisfies Record<SkillLevel, () => string>

const levels = () => Object.entries(skillLevelLabels).map(([value, label]) => ({ value, label: label() }))

type Editor = (form: BuilderForm, s: number) => ReactNode

const links: Editor = (form, s) => (
  <form.Field name={`sections[${s}].links`} mode="array">
    {list => (
      <ItemList
        count={list.state.value.length}
        onAdd={() => list.pushValue({ title: '', url: '' })}
        onRemove={i => list.removeValue(i)}
        fields={i => (
          <>
            <form.AppField name={`sections[${s}].links[${i}].title`}>
              {field => <field.TextField label={m.settings_item_title()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].links[${i}].url`}>
              {field => <field.TextField label={m.settings_item_url()} type="url" />}
            </form.AppField>
          </>
        )}
      />
    )}
  </form.Field>
)

const skills: Editor = (form, s) => (
  <form.Field name={`sections[${s}].skills`} mode="array">
    {list => (
      <ItemList
        count={list.state.value.length}
        onAdd={() => list.pushValue({ name: '', level: 'intermediate', category: '' })}
        onRemove={i => list.removeValue(i)}
        fields={i => (
          <>
            <form.AppField name={`sections[${s}].skills[${i}].name`}>
              {field => <field.TextField label={m.settings_item_skill()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].skills[${i}].level`}>
              {field => <field.SelectField label={m.settings_item_level()} options={levels()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].skills[${i}].category`}>
              {field => <field.TextField label={m.settings_item_category()} />}
            </form.AppField>
          </>
        )}
      />
    )}
  </form.Field>
)

const experience: Editor = (form, s) => (
  <form.Field name={`sections[${s}].experiences`} mode="array">
    {list => (
      <ItemList
        count={list.state.value.length}
        onAdd={() => list.pushValue({ title: '', organization: '', startDate: '', current: false, description: '' })}
        onRemove={i => list.removeValue(i)}
        fields={i => (
          <>
            <form.AppField name={`sections[${s}].experiences[${i}].title`}>
              {field => <field.TextField label={m.settings_item_position()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].experiences[${i}].organization`}>
              {field => <field.TextField label={m.settings_item_organization()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].experiences[${i}].startDate`}>
              {field => <field.TextField label={m.settings_item_start()} type="date" />}
            </form.AppField>
            <form.AppField name={`sections[${s}].experiences[${i}].endDate`}>
              {field => <field.TextField label={m.settings_item_end()} type="date" />}
            </form.AppField>
            <form.AppField name={`sections[${s}].experiences[${i}].current`}>
              {field => <field.CheckboxField label={m.settings_item_current()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].experiences[${i}].description`}>
              {field => <field.TextareaField label={m.settings_item_description()} />}
            </form.AppField>
          </>
        )}
      />
    )}
  </form.Field>
)

const education: Editor = (form, s) => (
  <form.Field name={`sections[${s}].education`} mode="array">
    {list => (
      <ItemList
        count={list.state.value.length}
        onAdd={() => list.pushValue({ institution: '', degree: '', field: '', startDate: '', current: false })}
        onRemove={i => list.removeValue(i)}
        fields={i => (
          <>
            <form.AppField name={`sections[${s}].education[${i}].institution`}>
              {field => <field.TextField label={m.settings_item_institution()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].education[${i}].degree`}>
              {field => <field.TextField label={m.settings_item_degree()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].education[${i}].field`}>
              {field => <field.TextField label={m.settings_item_field()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].education[${i}].startDate`}>
              {field => <field.TextField label={m.settings_item_start()} type="date" />}
            </form.AppField>
            <form.AppField name={`sections[${s}].education[${i}].endDate`}>
              {field => <field.TextField label={m.settings_item_end()} type="date" />}
            </form.AppField>
            <form.AppField name={`sections[${s}].education[${i}].current`}>
              {field => <field.CheckboxField label={m.settings_item_current()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].education[${i}].description`}>
              {field => <field.TextareaField label={m.settings_item_description()} />}
            </form.AppField>
          </>
        )}
      />
    )}
  </form.Field>
)

const affiliation: Editor = (form, s) => (
  <form.Field name={`sections[${s}].affiliations`} mode="array">
    {list => (
      <ItemList
        count={list.state.value.length}
        onAdd={() => list.pushValue({ name: '', logoUrl: '', description: '' })}
        onRemove={i => list.removeValue(i)}
        fields={i => (
          <>
            <form.AppField name={`sections[${s}].affiliations[${i}].name`}>
              {field => <field.TextField label={m.settings_item_name()} />}
            </form.AppField>
            <form.AppField name={`sections[${s}].affiliations[${i}].logoUrl`}>
              {field => <field.TextField label={m.settings_item_logo()} type="url" />}
            </form.AppField>
            <form.AppField name={`sections[${s}].affiliations[${i}].description`}>
              {field => <field.TextareaField label={m.settings_item_description()} />}
            </form.AppField>
          </>
        )}
      />
    )}
  </form.Field>
)

const gallery: Editor = (form, s) => (
  <form.Field name={`sections[${s}].images`} mode="array">
    {list => (
      <ItemList
        count={list.state.value.length}
        onAdd={() => list.pushValue({ url: '', caption: '' })}
        onRemove={i => list.removeValue(i)}
        fields={i => (
          <>
            <form.AppField name={`sections[${s}].images[${i}].url`}>
              {field => <field.TextField label={m.settings_item_image()} type="url" />}
            </form.AppField>
            <form.AppField name={`sections[${s}].images[${i}].caption`}>
              {field => <field.TextField label={m.settings_item_caption()} />}
            </form.AppField>
          </>
        )}
      />
    )}
  </form.Field>
)

const editors: Partial<Record<SectionType, Editor>> = {
  links,
  skills,
  experience,
  education,
  affiliation,
  'image-gallery': gallery,
}

/** The item list of a section kind that has items (text, courses and gamification have none). */
export function SectionItems({ form, index, type }: { form: BuilderForm; index: number; type: SectionType }) {
  return editors[type]?.(form, index) ?? null
}
