import { ArrowDown, ArrowUp, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ProfileSection } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'

import type { SectionType } from '../model/profile-sections'
import type { BuilderForm } from './profile-builder'
import { SectionItems } from './section-items'

export const sectionTypeLabels = {
  text: m.settings_section_text,
  links: m.settings_section_links,
  skills: m.settings_section_skills,
  experience: m.settings_section_experience,
  education: m.settings_section_education,
  affiliation: m.settings_section_affiliation,
  'image-gallery': m.settings_section_image_gallery,
  courses: m.settings_section_courses,
  gamification: m.settings_section_gamification,
} satisfies Record<SectionType, () => string>

type SectionEditorProps = {
  form: BuilderForm
  index: number
  section: ProfileSection
  last: boolean
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

/** One builder section: its kind, title, body fields, and the move and remove buttons. */
export function SectionEditor({ form, index, section, last, onMove, onRemove }: SectionEditorProps) {
  const kind = sectionTypeLabels[section.type]()
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">{kind}</legend>
      <div className="flex justify-end gap-1">
        <IconButton
          label={m.settings_builder_up()}
          icon={<ArrowUp aria-hidden />}
          onClick={() => onMove(-1)}
          disabled={index === 0}
        />
        <IconButton
          label={m.settings_builder_down()}
          icon={<ArrowDown aria-hidden />}
          onClick={() => onMove(1)}
          disabled={last}
        />
        <IconButton label={m.settings_builder_remove()} icon={<X aria-hidden />} onClick={onRemove} />
      </div>
      <form.AppField name={`sections[${index}].title`}>
        {field => <field.TextField label={m.settings_builder_section_title()} />}
      </form.AppField>
      {section.type === 'text' ? (
        <form.AppField name={`sections[${index}].content`}>
          {field => <field.TextareaField label={m.settings_builder_content()} />}
        </form.AppField>
      ) : null}
      {section.type === 'courses' ? (
        <p className="text-sm text-muted-foreground">{m.settings_builder_courses_hint()}</p>
      ) : null}
      {section.type === 'gamification' ? (
        <p className="text-sm text-muted-foreground">{m.settings_builder_gamification_hint()}</p>
      ) : null}
      <SectionItems form={form} index={index} type={section.type} />
    </fieldset>
  )
}
