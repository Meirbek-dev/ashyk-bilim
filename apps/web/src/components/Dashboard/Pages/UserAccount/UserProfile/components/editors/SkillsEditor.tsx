import type { FC } from 'react'
import { Award } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { NativeSelect, NativeSelectOption } from '@components/ui/native-select'
import { skillLevelItems } from '../../types'
import type { ProfileSkill, SkillsSection } from '../../types'
import { AddItemButton, RemoveItemButton, SectionFrame, patchAt } from './SectionFrame'

interface SkillsEditorProps {
  t: AppTranslator
  section: SkillsSection
  onChange: (section: SkillsSection) => void
}

export const SkillsEditor: FC<SkillsEditorProps> = ({ t, section, onChange }) => (
  <SectionFrame
    t={t}
    icon={Award}
    heading={t('SkillsEditor.title')}
    title={section.title}
    onTitleChange={title => onChange({ ...section, title })}
  >
    <div>
      <Label>{t('SkillsEditor.skillsLabel')}</Label>
      <div className="mt-2 space-y-3">
        {section.skills.map((skill, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 rounded-lg border p-4">
            <Input
              value={skill.name}
              aria-label={t('SkillsEditor.skillNamePlaceholder')}
              onChange={e => {
                onChange({ ...section, skills: patchAt(section.skills, index, { name: e.target.value }) })
              }}
              placeholder={t('SkillsEditor.skillNamePlaceholder')}
            />
            <NativeSelect
              value={skill.level ?? 'intermediate'}
              aria-label={t('SkillsEditor.selectLevelPlaceholder')}
              onChange={e => {
                const level = e.target.value as NonNullable<ProfileSkill['level']>
                onChange({ ...section, skills: patchAt(section.skills, index, { level }) })
              }}
            >
              {skillLevelItems(t).map(item => (
                <NativeSelectOption key={item.value} value={item.value}>
                  {item.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              value={skill.category ?? ''}
              aria-label={t('SkillsEditor.categoryPlaceholder')}
              onChange={e => {
                onChange({ ...section, skills: patchAt(section.skills, index, { category: e.target.value }) })
              }}
              placeholder={t('SkillsEditor.categoryPlaceholder')}
            />
            <RemoveItemButton
              iconOnly
              label={t('AffiliationEditor.removeButton')}
              onClick={() => onChange({ ...section, skills: section.skills.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
        <AddItemButton
          label={t('SkillsEditor.addSkillButton')}
          onClick={() => onChange({ ...section, skills: [...section.skills, { name: '', level: 'intermediate' }] })}
        />
      </div>
    </div>
  </SectionFrame>
)
