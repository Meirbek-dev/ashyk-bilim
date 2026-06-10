import type { FC } from 'react'
import { Award, Plus, Trash2 } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { NativeSelect, NativeSelectOption } from '@components/ui/native-select'
import { skillLevelItems } from '../../types'
import type { ProfileSkill, SkillsSection } from '../../types'

interface SkillsEditorProps {
  t: AppTranslator
  section: SkillsSection
  onChange: (section: SkillsSection) => void
}

export const SkillsEditor: FC<SkillsEditorProps> = ({ t, section, onChange }) => {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <Award className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('SkillsEditor.title')}</h3>
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

        {/* Skills */}
        <div>
          <Label>{t('SkillsEditor.skillsLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.skills.map((skill, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 rounded-lg border p-4">
                <Input
                  value={skill.name}
                  onChange={e => {
                    const newSkills = [...section.skills]
                    newSkills[index] = { ...skill, name: e.target.value }
                    onChange({ ...section, skills: newSkills })
                  }}
                  placeholder={t('SkillsEditor.skillNamePlaceholder')}
                />
                <NativeSelect
                  value={skill.level || 'intermediate'}
                  onChange={e => {
                    const newSkills = [...section.skills]
                    newSkills[index] = {
                      ...skill,
                      level: e.target.value as Exclude<ProfileSkill['level'], undefined>,
                    }
                    onChange({ ...section, skills: newSkills })
                  }}
                >
                  {skillLevelItems(t).map(item => (
                    <NativeSelectOption key={item.value} value={item.value}>
                      {item.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  value={skill.category || ''}
                  onChange={e => {
                    const newSkills = [...section.skills]
                    newSkills[index] = { ...skill, category: e.target.value }
                    onChange({ ...section, skills: newSkills })
                  }}
                  placeholder={t('SkillsEditor.categoryPlaceholder')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newSkills = section.skills.filter((_, i) => i !== index)
                    onChange({ ...section, skills: newSkills })
                  }}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newSkill: ProfileSkill = {
                  name: '',
                  level: 'intermediate',
                }
                onChange({
                  ...section,
                  skills: [...section.skills, newSkill],
                })
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('SkillsEditor.addSkillButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
