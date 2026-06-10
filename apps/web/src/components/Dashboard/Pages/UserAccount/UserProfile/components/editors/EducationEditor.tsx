import type { FC } from 'react'
import { GraduationCap, Plus, Trash2 } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { Checkbox } from '@components/ui/checkbox'
import { useLocale } from 'next-intl'
import { de, enUS, es, fr, ru } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { DatePicker } from '../DatePicker'
import type { EducationSection, ProfileEducation } from '../../types'

interface EducationEditorProps {
  t: AppTranslator
  section: EducationSection
  onChange: (section: EducationSection) => void
}

export const EducationEditor: FC<EducationEditorProps> = ({ t, section, onChange }) => {
  const fullLocale = useLocale()
  const locale = fullLocale.split('-')[0] ?? 'ru'
  const dateFnsLocale = (() => {
    const localeMap: Record<string, Locale> = {
      en: enUS,
      es,
      fr,
      de,
      ru,
    }
    return localeMap[locale] || enUS
  })()

  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <GraduationCap className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('EducationEditor.title')}</h3>
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

        {/* Education Items */}
        <div>
          <Label>{t('EducationEditor.educationItemsLabel')}</Label>
          <div className="mt-2 space-y-4">
            {section.education.map((edu, index) => (
              <div key={index} className="space-y-4 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('EducationEditor.institutionLabel')}</Label>
                    <Input
                      value={edu.institution}
                      onChange={e => {
                        const newEducation = [...section.education]
                        newEducation[index] = {
                          ...edu,
                          institution: e.target.value,
                        }
                        onChange({ ...section, education: newEducation })
                      }}
                      placeholder={t('EducationEditor.institutionPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('EducationEditor.degreeLabel')}</Label>
                    <Input
                      value={edu.degree}
                      onChange={e => {
                        const newEducation = [...section.education]
                        newEducation[index] = {
                          ...edu,
                          degree: e.target.value,
                        }
                        onChange({ ...section, education: newEducation })
                      }}
                      placeholder={t('EducationEditor.degreePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t('EducationEditor.fieldOfStudyLabel')}</Label>
                  <Input
                    value={edu.field}
                    onChange={e => {
                      const newEducation = [...section.education]
                      newEducation[index] = { ...edu, field: e.target.value }
                      onChange({ ...section, education: newEducation })
                    }}
                    placeholder={t('EducationEditor.fieldOfStudyPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-4">
                  <div>
                    <Label>{t('EducationEditor.startDateLabel')}</Label>
                    <DatePicker
                      value={edu.startDate}
                      onChange={date => {
                        const newEducation = [...section.education]
                        newEducation[index] = {
                          ...edu,
                          startDate: date,
                        }
                        onChange({ ...section, education: newEducation })
                      }}
                      placeholder={t('EducationEditor.startDatePlaceholder')}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div>
                    <Label>{t('EducationEditor.endDateLabel')}</Label>
                    <DatePicker
                      value={edu.endDate || ''}
                      onChange={date => {
                        const newEducation = [...section.education]
                        newEducation[index] = {
                          ...edu,
                          endDate: date,
                        }
                        onChange({ ...section, education: newEducation })
                      }}
                      placeholder={t('EducationEditor.endDatePlaceholder')}
                      disabled={edu.current}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`current-edu-${index}`}
                        checked={edu.current}
                        onCheckedChange={checked => {
                          const newEducation = [...section.education]
                          const { endDate: _endDate, ...educationWithoutEndDate } = edu
                          const nextEndDate = checked ? undefined : edu.endDate
                          newEducation[index] =
                            nextEndDate === undefined
                              ? { ...educationWithoutEndDate, current: checked }
                              : {
                                  ...educationWithoutEndDate,
                                  current: checked,
                                  endDate: nextEndDate,
                                }
                          onChange({ ...section, education: newEducation })
                        }}
                      />
                      <Label htmlFor={`current-edu-${index}`}>{t('EducationEditor.currentLabel')}</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>{t('EducationEditor.descriptionLabel')}</Label>
                  <Textarea
                    value={edu.description || ''}
                    onChange={e => {
                      const newEducation = [...section.education]
                      newEducation[index] = {
                        ...edu,
                        description: e.target.value,
                      }
                      onChange({ ...section, education: newEducation })
                    }}
                    placeholder={t('EducationEditor.descriptionPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newEducation = section.education.filter((_, i) => i !== index)
                      onChange({ ...section, education: newEducation })
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('EducationEditor.removeButton')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newEducation: ProfileEducation = {
                  institution: '',
                  degree: '',
                  field: '',
                  startDate: new Date().toISOString().split('T')[0] || '',
                  current: false,
                  description: '',
                }
                onChange({
                  ...section,
                  education: [...section.education, newEducation],
                })
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('EducationEditor.addEducationButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
