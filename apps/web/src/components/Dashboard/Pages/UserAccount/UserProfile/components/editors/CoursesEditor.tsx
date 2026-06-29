import type { FC } from 'react'
import { BookOpen } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import type { CoursesSection } from '../../types'

interface CoursesEditorProps {
  t: AppTranslator
  section: CoursesSection
  onChange: (section: CoursesSection) => void
}

export const CoursesEditor: FC<CoursesEditorProps> = ({ t, section, onChange }) => {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <BookOpen className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('CoursesEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={e => {
              onChange({ ...section, title: e.target.value })
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        <div className="text-muted-foreground text-sm italic">{t('CoursesEditor.autoDisplayMessage')}</div>
      </div>
    </div>
  )
}
