import type { FC } from 'react'
import { BookOpen } from 'lucide-react'
import type { CoursesSection } from '../../types'
import { SectionFrame } from './SectionFrame'

interface CoursesEditorProps {
  t: AppTranslator
  section: CoursesSection
  onChange: (section: CoursesSection) => void
}

export const CoursesEditor: FC<CoursesEditorProps> = ({ t, section, onChange }) => (
  <SectionFrame
    t={t}
    icon={BookOpen}
    heading={t('CoursesEditor.title')}
    title={section.title}
    onTitleChange={title => onChange({ ...section, title })}
  >
    <div className="text-muted-foreground text-sm italic">{t('CoursesEditor.autoDisplayMessage')}</div>
  </SectionFrame>
)
