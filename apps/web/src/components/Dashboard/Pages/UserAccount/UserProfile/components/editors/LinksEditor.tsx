import type { FC } from 'react'
import { Link as LinkIcon } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import type { LinksSection } from '../../types'
import { AddItemButton, RemoveItemButton, SectionFrame, patchAt } from './SectionFrame'

interface LinksEditorProps {
  t: AppTranslator
  section: LinksSection
  onChange: (section: LinksSection) => void
}

export const LinksEditor: FC<LinksEditorProps> = ({ t, section, onChange }) => (
  <SectionFrame
    t={t}
    icon={LinkIcon}
    heading={t('LinksEditor.title')}
    title={section.title}
    onTitleChange={title => onChange({ ...section, title })}
  >
    <div>
      <Label>{t('LinksEditor.linksLabel')}</Label>
      <div className="mt-2 space-y-3">
        {section.links.map((link, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border p-4">
            <Input
              value={link.title}
              aria-label={t('LinksEditor.linkTitlePlaceholder')}
              onChange={e => {
                onChange({ ...section, links: patchAt(section.links, index, { title: e.target.value }) })
              }}
              placeholder={t('LinksEditor.linkTitlePlaceholder')}
            />
            <Input
              value={link.url}
              aria-label={t('LinksEditor.urlPlaceholder')}
              onChange={e => {
                onChange({ ...section, links: patchAt(section.links, index, { url: e.target.value }) })
              }}
              placeholder={t('LinksEditor.urlPlaceholder')}
            />
            <RemoveItemButton
              iconOnly
              label={t('AffiliationEditor.removeButton')}
              onClick={() => onChange({ ...section, links: section.links.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
        <AddItemButton
          label={t('LinksEditor.addLinkButton')}
          onClick={() => onChange({ ...section, links: [...section.links, { title: '', url: '' }] })}
        />
      </div>
    </div>
  </SectionFrame>
)
