import {
  Award,
  BookOpen,
  Briefcase,
  GraduationCap,
  ImageIcon,
  Link as LinkIcon,
  MapPin,
  TextIcon,
  Trophy,
} from 'lucide-react'

export const SECTION_TYPE_KEYS = {
  'image-gallery': 'imageGallery',
  text: 'text',
  links: 'links',
  skills: 'skills',
  experience: 'experience',
  education: 'education',
  affiliation: 'affiliation',
  courses: 'courses',
  gamification: 'gamification',
} as const

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
  gamification: {
    icon: Trophy,
    label: t('SectionTypes.gamification.label'),
    description: t('SectionTypes.gamification.description'),
  },
})

export const skillLevelItems = (t: AppTranslator) => [
  { value: 'beginner', label: t('SkillsEditor.levelBeginner') },
  { value: 'intermediate', label: t('SkillsEditor.levelIntermediate') },
  { value: 'advanced', label: t('SkillsEditor.levelAdvanced') },
  { value: 'expert', label: t('SkillsEditor.levelExpert') },
]

export interface ProfileImage {
  url: string
  caption?: string
}

export interface ProfileLink {
  title: string
  url: string
  icon?: string
}

export interface ProfileSkill {
  name: string
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  category?: string
}

export interface ProfileExperience {
  title: string
  organization: string
  startDate: string
  endDate?: string
  current: boolean
  description: string
}

export interface ProfileEducation {
  institution: string
  degree: string
  field: string
  startDate: string
  endDate?: string
  current: boolean
  description?: string
}

export interface ProfileAffiliation {
  name: string
  description: string
  logoUrl: string
}

export interface BaseSection {
  id: string
  type: keyof typeof SECTION_TYPE_KEYS
  title: string
}

export type ImageGallerySection = {
  type: 'image-gallery'
  images: ProfileImage[]
} & BaseSection

export type TextSection = {
  type: 'text'
  content: string
} & BaseSection

export type LinksSection = {
  type: 'links'
  links: ProfileLink[]
} & BaseSection

export type SkillsSection = {
  type: 'skills'
  skills: ProfileSkill[]
} & BaseSection

export type ExperienceSection = {
  type: 'experience'
  experiences: ProfileExperience[]
} & BaseSection

export type EducationSection = {
  type: 'education'
  education: ProfileEducation[]
} & BaseSection

export type AffiliationSection = {
  type: 'affiliation'
  affiliations: ProfileAffiliation[]
} & BaseSection

export type CoursesSection = {
  type: 'courses'
} & BaseSection

export type GamificationSection = {
  type: 'gamification'
  settings: {
    showLevel: boolean
    showXP: boolean
    showStreaks: boolean
    showLeaderboard: boolean
  }
} & BaseSection

export type ProfileSection =
  | ImageGallerySection
  | TextSection
  | LinksSection
  | SkillsSection
  | ExperienceSection
  | EducationSection
  | AffiliationSection
  | CoursesSection
  | GamificationSection

export interface ProfileData {
  sections: ProfileSection[]
}
