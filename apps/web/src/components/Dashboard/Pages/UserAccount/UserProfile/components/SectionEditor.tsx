import type { FC } from 'react'
import type { ProfileSection } from '../types'
import { ImageGalleryEditor } from './editors/ImageGalleryEditor'
import { TextEditor } from './editors/TextEditor'
import { LinksEditor } from './editors/LinksEditor'
import { SkillsEditor } from './editors/SkillsEditor'
import { ExperienceEditor } from './editors/ExperienceEditor'
import { EducationEditor } from './editors/EducationEditor'
import { AffiliationEditor } from './editors/AffiliationEditor'
import { CoursesEditor } from './editors/CoursesEditor'

interface SectionEditorProps {
  t: AppTranslator
  section: ProfileSection
  onChange: (section: ProfileSection) => void
}

export const SectionEditor: FC<SectionEditorProps> = ({ t, section, onChange }) => {
  switch (section.type) {
    case 'image-gallery': {
      return <ImageGalleryEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'text': {
      return <TextEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'links': {
      return <LinksEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'skills': {
      return <SkillsEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'experience': {
      return <ExperienceEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'education': {
      return <EducationEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'affiliation': {
      return <AffiliationEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    case 'courses': {
      return <CoursesEditor t={t} section={section} onChange={updated => onChange(updated)} />
    }
    default: {
      return <div>{t('Errors.unknownSectionType')}</div>
    }
  }
}
