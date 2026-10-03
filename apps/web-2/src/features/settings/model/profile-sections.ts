import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { ProfileSection, ProfileSections } from '#/shared/api/gen/types.gen'
import {
  vAffiliationSection,
  vCoursesSection,
  vEducationSection,
  vExperienceSection,
  vGamificationSection,
  vImageGallerySection,
  vLinksSection,
  vProfileAffiliation,
  vProfileImage,
  vProfileLink,
  vSkillsSection,
  vTextSection,
} from '#/shared/api/gen/valibot.gen'

export type SectionType = ProfileSection['type']

/** What "Add section" offers; `gamification` is a legacy kind that is kept but not offered. */
export const ADDABLE_SECTIONS = [
  'text',
  'links',
  'skills',
  'experience',
  'education',
  'affiliation',
  'image-gallery',
  'courses',
] as const satisfies readonly SectionType[]

const blankSections: { [T in SectionType]: (id: string, title: string) => Extract<ProfileSection, { type: T }> } = {
  text: (id, title) => ({ type: 'text', id, title, content: '' }),
  links: (id, title) => ({ type: 'links', id, title, links: [] }),
  skills: (id, title) => ({ type: 'skills', id, title, skills: [] }),
  experience: (id, title) => ({ type: 'experience', id, title, experiences: [] }),
  education: (id, title) => ({ type: 'education', id, title, education: [] }),
  affiliation: (id, title) => ({ type: 'affiliation', id, title, affiliations: [] }),
  'image-gallery': (id, title) => ({ type: 'image-gallery', id, title, images: [] }),
  courses: (id, title) => ({ type: 'courses', id, title }),
  gamification: (id, title) => ({ type: 'gamification', id, title }),
}

/** A new empty section of a kind; `id` must be unique in the document (UX-271). */
export const newSection = (type: SectionType, id: string, title: string): ProfileSection =>
  blankSections[type](id, title)

const blankToNull = (value: string | null | undefined) => (value ? value : null)

const span = <T extends { current: boolean; endDate?: string | null }>(item: T): T => ({
  ...item,
  endDate: item.current ? null : blankToNull(item.endDate),
})

/** What the form edits -> what the API stores: blank optional dates become null, "current" clears the end. */
export function normalizeSections(document: ProfileSections): ProfileSections {
  return {
    sections: document.sections.map(section => {
      if (section.type === 'experience') return { ...section, experiences: section.experiences.map(span) }
      if (section.type === 'education') return { ...section, education: section.education.map(span) }
      if (section.type === 'image-gallery')
        return { ...section, images: section.images.map(image => ({ ...image, caption: blankToNull(image.caption) })) }
      return section
    }),
  }
}

const HTTP_URL = /^https?:\/\/\S+$/i
const httpUrl = v.pipe(
  v.string(),
  v.regex(HTTP_URL, () => m.settings_builder_url_invalid()),
)
const optionalHttpUrl = v.pipe(
  v.string(),
  v.check(
    url => url === '' || HTTP_URL.test(url),
    () => m.settings_builder_url_invalid(),
  ),
)

const tagged = <const T extends SectionType, E extends v.ObjectEntries>(type: T, entries: E) =>
  v.object({ ...entries, type: v.literal(type) })

/**
 * The builder's form schema, composed from the generated section schemas: the generated `vProfileSection`
 * rejects every section (strict variant + separate tag, see SPEC "Ждёт сервера"). Adds the http(s) check of
 * link, image and logo addresses that the old builder ran before saving.
 */
export const vBuilderDocument: v.GenericSchema<ProfileSections> = v.object({
  sections: v.array(
    v.variant('type', [
      tagged('text', vTextSection.entries),
      tagged('links', {
        ...vLinksSection.entries,
        links: v.array(v.object({ ...vProfileLink.entries, url: httpUrl })),
      }),
      tagged('skills', vSkillsSection.entries),
      tagged('experience', vExperienceSection.entries),
      tagged('education', vEducationSection.entries),
      tagged('affiliation', {
        ...vAffiliationSection.entries,
        affiliations: v.array(v.object({ ...vProfileAffiliation.entries, logoUrl: optionalHttpUrl })),
      }),
      tagged('image-gallery', {
        ...vImageGallerySection.entries,
        images: v.array(v.object({ ...vProfileImage.entries, url: httpUrl })),
      }),
      tagged('courses', vCoursesSection.entries),
      tagged('gamification', vGamificationSection.entries),
    ]),
  ),
})
