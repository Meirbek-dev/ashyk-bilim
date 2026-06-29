import type { FC } from 'react'
import { TextIcon } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import type { TextSection } from '../../types'

interface TextEditorProps {
  t: AppTranslator
  section: TextSection
  onChange: (section: TextSection) => void
}

export const TextEditor: FC<TextEditorProps> = ({ t, section, onChange }) => {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <TextIcon className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('TextEditor.title')}</h3>
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

        {/* Content */}
        <div>
          <Label htmlFor="content">{t('TextEditor.contentLabel')}</Label>
          <Textarea
            id="content"
            value={section.content}
            onChange={e => {
              onChange({ ...section, content: e.target.value })
            }}
            placeholder={t('TextEditor.contentPlaceholder')}
            className="min-h-[200px]"
          />
        </div>
      </div>
    </div>
  )
}
