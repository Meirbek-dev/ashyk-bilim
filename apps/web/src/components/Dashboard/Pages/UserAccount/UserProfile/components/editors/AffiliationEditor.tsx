import type { FC } from 'react'
import { MapPin } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import type { AffiliationSection } from '../../types'
import { AddItemButton, RemoveItemButton, SectionFrame, patchAt } from './SectionFrame'

interface AffiliationEditorProps {
  t: AppTranslator
  section: AffiliationSection
  onChange: (section: AffiliationSection) => void
}

export const AffiliationEditor: FC<AffiliationEditorProps> = ({ t, section, onChange }) => {
  const patch = (index: number, changes: Partial<AffiliationSection['affiliations'][number]>) =>
    onChange({ ...section, affiliations: patchAt(section.affiliations, index, changes) })

  return (
    <SectionFrame
      t={t}
      icon={MapPin}
      heading={t('AffiliationEditor.title')}
      title={section.title}
      onTitleChange={title => onChange({ ...section, title })}
    >
      <div>
        <Label>{t('AffiliationEditor.affiliationsLabel')}</Label>
        <div className="mt-2 space-y-3">
          {section.affiliations.map((affiliation, index) => (
            <div key={index} className="space-y-4 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`aff-name-${index}`}>{t('AffiliationEditor.nameLabel')}</Label>
                  <Input
                    id={`aff-name-${index}`}
                    value={affiliation.name}
                    onChange={e => patch(index, { name: e.target.value })}
                    placeholder={t('AffiliationEditor.namePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor={`aff-logo-${index}`}>{t('AffiliationEditor.logoUrlLabel')}</Label>
                  <Input
                    id={`aff-logo-${index}`}
                    value={affiliation.logoUrl}
                    onChange={e => patch(index, { logoUrl: e.target.value })}
                    placeholder={t('AffiliationEditor.logoUrlPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`aff-desc-${index}`}>{t('AffiliationEditor.descriptionLabel')}</Label>
                <Textarea
                  id={`aff-desc-${index}`}
                  value={affiliation.description}
                  onChange={e => patch(index, { description: e.target.value })}
                  placeholder={t('AffiliationEditor.descriptionPlaceholder')}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end">
                <RemoveItemButton
                  label={t('AffiliationEditor.removeButton')}
                  onClick={() =>
                    onChange({ ...section, affiliations: section.affiliations.filter((_, i) => i !== index) })
                  }
                />
              </div>
            </div>
          ))}
          <AddItemButton
            label={t('AffiliationEditor.addAffiliationButton')}
            onClick={() =>
              onChange({
                ...section,
                affiliations: [...section.affiliations, { name: '', description: '', logoUrl: '' }],
              })
            }
          />
        </div>
      </div>
    </SectionFrame>
  )
}
