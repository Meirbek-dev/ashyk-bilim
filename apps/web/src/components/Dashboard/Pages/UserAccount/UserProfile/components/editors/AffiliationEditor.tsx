import type { FC } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import type { AffiliationSection, ProfileAffiliation } from '../../types'

interface AffiliationEditorProps {
  t: AppTranslator
  section: AffiliationSection
  onChange: (section: AffiliationSection) => void
}

export const AffiliationEditor: FC<AffiliationEditorProps> = ({ t, section, onChange }) => {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <MapPin className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('AffiliationEditor.title')}</h3>
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

        {/* Affiliations */}
        <div>
          <Label>{t('AffiliationEditor.affiliationsLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.affiliations.map((affiliation, index) => (
              <div key={index} className="space-y-4 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('AffiliationEditor.nameLabel')}</Label>
                    <Input
                      value={affiliation.name}
                      onChange={e => {
                        const newAffiliations = [...section.affiliations]
                        newAffiliations[index] = {
                          ...affiliation,
                          name: e.target.value,
                        }
                        onChange({ ...section, affiliations: newAffiliations })
                      }}
                      placeholder={t('AffiliationEditor.namePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('AffiliationEditor.logoUrlLabel')}</Label>
                    <Input
                      value={affiliation.logoUrl}
                      onChange={e => {
                        const newAffiliations = [...section.affiliations]
                        newAffiliations[index] = {
                          ...affiliation,
                          logoUrl: e.target.value,
                        }
                        onChange({ ...section, affiliations: newAffiliations })
                      }}
                      placeholder={t('AffiliationEditor.logoUrlPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t('AffiliationEditor.descriptionLabel')}</Label>
                  <Textarea
                    value={affiliation.description}
                    onChange={e => {
                      const newAffiliations = [...section.affiliations]
                      newAffiliations[index] = {
                        ...affiliation,
                        description: e.target.value,
                      }
                      onChange({ ...section, affiliations: newAffiliations })
                    }}
                    placeholder={t('AffiliationEditor.descriptionPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const newAffiliations = section.affiliations.filter((_, i) => i !== index)
                      onChange({ ...section, affiliations: newAffiliations })
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('AffiliationEditor.removeButton')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newAffiliation: ProfileAffiliation = {
                  name: '',
                  description: '',
                  logoUrl: '',
                }
                onChange({
                  ...section,
                  affiliations: [...section.affiliations, newAffiliation],
                })
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('AffiliationEditor.addAffiliationButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
