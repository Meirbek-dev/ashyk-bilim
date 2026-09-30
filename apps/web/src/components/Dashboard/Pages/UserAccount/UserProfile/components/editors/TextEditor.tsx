import type { FC } from 'react'
import { TextIcon } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import type { TextSection } from '../../types'
import { SectionFrame } from './SectionFrame'

interface TextEditorProps {
  t: AppTranslator
  section: TextSection
  onChange: (section: TextSection) => void
}

export const TextEditor: FC<TextEditorProps> = ({ t, section, onChange }) => (
  <SectionFrame
    t={t}
    icon={TextIcon}
    heading={t('TextEditor.title')}
    title={section.title}
    onTitleChange={title => onChange({ ...section, title })}
  >
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
  </SectionFrame>
)
