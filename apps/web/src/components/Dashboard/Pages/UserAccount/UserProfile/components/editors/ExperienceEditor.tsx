import type { FC } from 'react'
import { Briefcase, Plus, Trash2 } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { Checkbox } from '@components/ui/checkbox'
import { useLocale } from 'next-intl'
import { de, enUS, es, fr, ru } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { DatePicker } from '../DatePicker'
import type { ExperienceSection, ProfileExperience } from '../../types'

interface ExperienceEditorProps {
  t: AppTranslator
  section: ExperienceSection
  onChange: (section: ExperienceSection) => void
}

export const ExperienceEditor: FC<ExperienceEditorProps> = ({ t, section, onChange }) => {
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
        <Briefcase className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('ExperienceEditor.title')}</h3>
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

        {/* Experiences */}
        <div>
          <Label>{t('ExperienceEditor.experienceItemsLabel')}</Label>
          <div className="mt-2 space-y-4">
            {section.experiences.map((experience, index) => (
              <div key={index} className="space-y-4 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ExperienceEditor.titleLabel')}</Label>
                    <Input
                      value={experience.title}
                      onChange={e => {
                        const newExperiences = [...section.experiences]
                        newExperiences[index] = {
                          ...experience,
                          title: e.target.value,
                        }
                        onChange({ ...section, experiences: newExperiences })
                      }}
                      placeholder={t('ExperienceEditor.titlePlaceholder')}
                    />
                  </div>
                  <div>
                    <Label>{t('ExperienceEditor.organizationLabel')}</Label>
                    <Input
                      value={experience.organization}
                      onChange={e => {
                        const newExperiences = [...section.experiences]
                        newExperiences[index] = {
                          ...experience,
                          organization: e.target.value,
                        }
                        onChange({ ...section, experiences: newExperiences })
                      }}
                      placeholder={t('ExperienceEditor.organizationPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-4">
                  <div>
                    <Label>{t('ExperienceEditor.startDateLabel')}</Label>
                    <DatePicker
                      value={experience.startDate}
                      onChange={date => {
                        const newExperiences = [...section.experiences]
                        newExperiences[index] = {
                          ...experience,
                          startDate: date,
                        }
                        onChange({ ...section, experiences: newExperiences })
                      }}
                      placeholder={t('ExperienceEditor.startDatePlaceholder')}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div>
                    <Label>{t('ExperienceEditor.endDateLabel')}</Label>
                    <DatePicker
                      value={experience.endDate || ''}
                      onChange={date => {
                        const newExperiences = [...section.experiences]
                        newExperiences[index] = {
                          ...experience,
                          endDate: date,
                        }
                        onChange({ ...section, experiences: newExperiences })
                      }}
                      placeholder={t('ExperienceEditor.endDatePlaceholder')}
                      disabled={experience.current}
                      locale={dateFnsLocale}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`current-${index}`}
                        checked={experience.current}
                        onCheckedChange={checked => {
                          const newExperiences = [...section.experiences]
                          const { endDate: _endDate, ...experienceWithoutEndDate } = experience
                          const nextEndDate = checked ? undefined : experience.endDate
                          newExperiences[index] =
                            nextEndDate === undefined
                              ? { ...experienceWithoutEndDate, current: checked }
                              : {
                                  ...experienceWithoutEndDate,
                                  current: checked,
                                  endDate: nextEndDate,
                                }
                          onChange({ ...section, experiences: newExperiences })
                        }}
                      />
                      <Label htmlFor={`current-${index}`}>{t('ExperienceEditor.currentLabel')}</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>{t('ExperienceEditor.descriptionLabel')}</Label>
                  <Textarea
                    value={experience.description}
                    onChange={e => {
                      const newExperiences = [...section.experiences]
                      newExperiences[index] = {
                        ...experience,
                        description: e.target.value,
                      }
                      onChange({ ...section, experiences: newExperiences })
                    }}
                    placeholder={t('ExperienceEditor.descriptionPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newExperiences = section.experiences.filter((_, i) => i !== index)
                      onChange({ ...section, experiences: newExperiences })
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('ExperienceEditor.removeButton')}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const startDateStr = new Date().toISOString().split('T')[0]
                const newExperience: ProfileExperience = {
                  title: '',
                  organization: '',
                  startDate: startDateStr || '',
                  current: false,
                  description: '',
                }
                onChange({
                  ...section,
                  experiences: [...section.experiences, newExperience],
                })
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('ExperienceEditor.addExperienceButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
