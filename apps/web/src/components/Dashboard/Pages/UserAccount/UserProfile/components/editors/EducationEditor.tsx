import type { FC } from 'react'
import { GraduationCap } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Checkbox } from '@components/ui/checkbox'
import { DatePicker } from '../DatePicker'
import type { EducationSection } from '../../types'
import { AddItemButton, RemoveItemButton, SectionFrame, patchAt } from './SectionFrame'

interface EducationEditorProps {
  t: AppTranslator
  section: EducationSection
  onChange: (section: EducationSection) => void
}

export const EducationEditor: FC<EducationEditorProps> = ({ t, section, onChange }) => {
  const patch = (index: number, changes: Partial<EducationSection['education'][number]>) =>
    onChange({ ...section, education: patchAt(section.education, index, changes) })

  return (
    <SectionFrame
      t={t}
      icon={GraduationCap}
      heading={t('EducationEditor.title')}
      title={section.title}
      onTitleChange={title => onChange({ ...section, title })}
    >
      <div>
        <Label>{t('EducationEditor.educationItemsLabel')}</Label>
        <div className="mt-2 space-y-4">
          {section.education.map((edu, index) => (
            <div key={index} className="space-y-4 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`edu-inst-${index}`}>{t('EducationEditor.institutionLabel')}</Label>
                  <Input
                    id={`edu-inst-${index}`}
                    value={edu.institution}
                    onChange={e => patch(index, { institution: e.target.value })}
                    placeholder={t('EducationEditor.institutionPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor={`edu-degree-${index}`}>{t('EducationEditor.degreeLabel')}</Label>
                  <Input
                    id={`edu-degree-${index}`}
                    value={edu.degree}
                    onChange={e => patch(index, { degree: e.target.value })}
                    placeholder={t('EducationEditor.degreePlaceholder')}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`edu-field-${index}`}>{t('EducationEditor.fieldOfStudyLabel')}</Label>
                <Input
                  id={`edu-field-${index}`}
                  value={edu.field}
                  onChange={e => patch(index, { field: e.target.value })}
                  placeholder={t('EducationEditor.fieldOfStudyPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] gap-4">
                <div>
                  <Label>{t('EducationEditor.startDateLabel')}</Label>
                  <DatePicker
                    value={edu.startDate}
                    onChange={startDate => patch(index, { startDate })}
                    placeholder={t('EducationEditor.startDatePlaceholder')}
                  />
                </div>
                <div>
                  <Label>{t('EducationEditor.endDateLabel')}</Label>
                  <DatePicker
                    value={edu.endDate ?? ''}
                    onChange={endDate => patch(index, { endDate })}
                    placeholder={t('EducationEditor.endDatePlaceholder')}
                    disabled={edu.current}
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`current-edu-${index}`}
                      checked={edu.current}
                      onCheckedChange={checked =>
                        patch(index, checked ? { current: true, endDate: null } : { current: false })
                      }
                    />
                    <Label htmlFor={`current-edu-${index}`}>{t('EducationEditor.currentLabel')}</Label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor={`edu-desc-${index}`}>{t('EducationEditor.descriptionLabel')}</Label>
                <Textarea
                  id={`edu-desc-${index}`}
                  value={edu.description ?? ''}
                  onChange={e => patch(index, { description: e.target.value })}
                  placeholder={t('EducationEditor.descriptionPlaceholder')}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end">
                <RemoveItemButton
                  label={t('EducationEditor.removeButton')}
                  onClick={() => onChange({ ...section, education: section.education.filter((_, i) => i !== index) })}
                />
              </div>
            </div>
          ))}
          <AddItemButton
            label={t('EducationEditor.addEducationButton')}
            onClick={() =>
              onChange({
                ...section,
                education: [
                  ...section.education,
                  {
                    institution: '',
                    degree: '',
                    field: '',
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
