import type { FC } from 'react'
import { Briefcase } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Checkbox } from '@components/ui/checkbox'
import { DatePicker } from '../DatePicker'
import type { ExperienceSection } from '../../types'
import { AddItemButton, RemoveItemButton, SectionFrame, patchAt } from './SectionFrame'

interface ExperienceEditorProps {
  t: AppTranslator
  section: ExperienceSection
  onChange: (section: ExperienceSection) => void
}

export const ExperienceEditor: FC<ExperienceEditorProps> = ({ t, section, onChange }) => {
  const patch = (index: number, changes: Partial<ExperienceSection['experiences'][number]>) =>
    onChange({ ...section, experiences: patchAt(section.experiences, index, changes) })

  return (
    <SectionFrame
      t={t}
      icon={Briefcase}
      heading={t('ExperienceEditor.title')}
      title={section.title}
      onTitleChange={title => onChange({ ...section, title })}
    >
      <div>
        <Label>{t('ExperienceEditor.experienceItemsLabel')}</Label>
        <div className="mt-2 space-y-4">
          {section.experiences.map((experience, index) => (
            <div key={index} className="space-y-4 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`exp-title-${index}`}>{t('ExperienceEditor.titleLabel')}</Label>
                  <Input
                    id={`exp-title-${index}`}
                    value={experience.title}
                    onChange={e => patch(index, { title: e.target.value })}
                    placeholder={t('ExperienceEditor.titlePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor={`exp-org-${index}`}>{t('ExperienceEditor.organizationLabel')}</Label>
                  <Input
                    id={`exp-org-${index}`}
                    value={experience.organization}
                    onChange={e => patch(index, { organization: e.target.value })}
                    placeholder={t('ExperienceEditor.organizationPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] gap-4">
                <div>
                  <Label>{t('ExperienceEditor.startDateLabel')}</Label>
                  <DatePicker
                    value={experience.startDate}
                    onChange={startDate => patch(index, { startDate })}
                    placeholder={t('ExperienceEditor.startDatePlaceholder')}
                  />
                </div>
                <div>
                  <Label>{t('ExperienceEditor.endDateLabel')}</Label>
                  <DatePicker
                    value={experience.endDate ?? ''}
                    onChange={endDate => patch(index, { endDate })}
                    placeholder={t('ExperienceEditor.endDatePlaceholder')}
                    disabled={experience.current}
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`current-${index}`}
                      checked={experience.current}
                      onCheckedChange={checked =>
                        patch(index, checked ? { current: true, endDate: '' } : { current: false })
                      }
                    />
                    <Label htmlFor={`current-${index}`}>{t('ExperienceEditor.currentLabel')}</Label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor={`exp-desc-${index}`}>{t('ExperienceEditor.descriptionLabel')}</Label>
                <Textarea
                  id={`exp-desc-${index}`}
                  value={experience.description}
                  onChange={e => patch(index, { description: e.target.value })}
                  placeholder={t('ExperienceEditor.descriptionPlaceholder')}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end">
                <RemoveItemButton
                  label={t('ExperienceEditor.removeButton')}
                  onClick={() =>
                    onChange({ ...section, experiences: section.experiences.filter((_, i) => i !== index) })
                  }
                />
              </div>
            </div>
          ))}
          <AddItemButton
            label={t('ExperienceEditor.addExperienceButton')}
            onClick={() =>
              onChange({
                ...section,
                experiences: [
                  ...section.experiences,
                  {
                    title: '',
                    organization: '',
                    startDate: new Date().toISOString().slice(0, 10),
                    current: false,
                    description: '',
                  },
                ],
              })
            }
          />
        </div>
      </div>
    </SectionFrame>
  )
}
