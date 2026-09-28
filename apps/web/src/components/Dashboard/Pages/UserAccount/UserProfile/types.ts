import { Award, BookOpen, Briefcase, GraduationCap, ImageIcon, Link as LinkIcon, MapPin, TextIcon } from 'lucide-react'
import type { ProfileSection, ProfileSections } from '@/lib/api/generated/zod'

/**
 * The profile builder document is the server's `ProfileSections`
 * (`users.profile`, BUG-361): the section kinds and item shapes come from the
 * generated contract; this module only adds the editor's labels and icons.
 */
export type { ProfileSection, ProfileSections as ProfileData }

export type ImageGallerySection = Extract<ProfileSection, { type: 'image-gallery' }>
export type TextSection = Extract<ProfileSection, { type: 'text' }>
export type LinksSection = Extract<ProfileSection, { type: 'links' }>
export type SkillsSection = Extract<ProfileSection, { type: 'skills' }>
export type ExperienceSection = Extract<ProfileSection, { type: 'experience' }>
export type EducationSection = Extract<ProfileSection, { type: 'education' }>
export type AffiliationSection = Extract<ProfileSection, { type: 'affiliation' }>
export type CoursesSection = Extract<ProfileSection, { type: 'courses' }>

export type ProfileImage = ImageGallerySection['images'][number]
export type ProfileLink = LinksSection['links'][number]
export type ProfileSkill = SkillsSection['skills'][number]
export type ProfileExperience = ExperienceSection['experiences'][number]
export type ProfileEducation = EducationSection['education'][number]
export type ProfileAffiliation = AffiliationSection['affiliations'][number]

/** The kinds the editor offers (the contract also carries the legacy `gamification` kind, which has no editor). */
export const SECTION_TYPE_KEYS = {
  'image-gallery': 'imageGallery',
  text: 'text',
  links: 'links',
  skills: 'skills',
  experience: 'experience',
  education: 'education',
  affiliation: 'affiliation',
  courses: 'courses',
} as const

export type SectionKind = keyof typeof SECTION_TYPE_KEYS

export const getSectionTypesConfig = (t: AppTranslator) => ({
  'image-gallery': {
    icon: ImageIcon,
    label: t('SectionTypes.imageGallery.label'),
    description: t('SectionTypes.imageGallery.description'),
  },
  text: {
    icon: TextIcon,
    label: t('SectionTypes.text.label'),
    description: t('SectionTypes.text.description'),
  },
  links: {
    icon: LinkIcon,
    label: t('SectionTypes.links.label'),
    description: t('SectionTypes.links.description'),
  },
  skills: {
    icon: Award,
    label: t('SectionTypes.skills.label'),
    description: t('SectionTypes.skills.description'),
  },
  experience: {
    icon: Briefcase,
    label: t('SectionTypes.experience.label'),
    description: t('SectionTypes.experience.description'),
  },
  education: {
    icon: GraduationCap,
    label: t('SectionTypes.education.label'),
    description: t('SectionTypes.education.description'),
  },
  affiliation: {
    icon: MapPin,
    label: t('SectionTypes.affiliation.label'),
    description: t('SectionTypes.affiliation.description'),
  },
  courses: {
    icon: BookOpen,
    label: t('SectionTypes.courses.label'),
    description: t('SectionTypes.courses.description'),
  },
})

/** Icon + label for any stored kind (`gamification` falls back to the trophy-less generic entry). */
export function sectionMeta(t: AppTranslator, type: ProfileSection['type']) {
  const config = getSectionTypesConfig(t)
  return type in config ? config[type as SectionKind] : { icon: Award, label: type, description: '' }
}

export const skillLevelItems = (t: AppTranslator) => [
  { value: 'beginner', label: t('SkillsEditor.levelBeginner') },
  { value: 'intermediate', label: t('SkillsEditor.levelIntermediate') },
  { value: 'advanced', label: t('SkillsEditor.levelAdvanced') },
  { value: 'expert', label: t('SkillsEditor.levelExpert') },
]

export function createEmptySection(t: AppTranslator, type: SectionKind): ProfileSection {
  const base = {
    id: `section-${Date.now()}`,
    title: t('EmptySections.defaultTitle', { sectionName: getSectionTypesConfig(t)[type].label }),
  }
  switch (type) {
    case 'image-gallery': {
      return { ...base, type, images: [] }
    }
    case 'text': {
      return { ...base, type, content: '' }
    }
    case 'links': {
      return { ...base, type, links: [] }
    }
    case 'skills': {
      return { ...base, type, skills: [] }
    }
    case 'experience': {
      return { ...base, type, experiences: [] }
    }
    case 'education': {
      return { ...base, type, education: [] }
    }
    case 'affiliation': {
      return { ...base, type, affiliations: [] }
    }
    case 'courses': {
      return { ...base, type }
    }
  }
}
