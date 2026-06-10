import type { FC } from 'react'
import { Link as LinkIcon, Plus, Trash2 } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import type { LinksSection, ProfileLink } from '../../types'

interface LinksEditorProps {
  t: AppTranslator
  section: LinksSection
  onChange: (section: LinksSection) => void
}

export const LinksEditor: FC<LinksEditorProps> = ({ t, section, onChange }) => {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <LinkIcon className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('LinksEditor.title')}</h3>
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

        {/* Links */}
        <div>
          <Label>{t('LinksEditor.linksLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.links.map((link, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border p-4">
                <Input
                  value={link.title}
                  onChange={e => {
                    const newLinks = [...section.links]
                    newLinks[index] = { ...link, title: e.target.value }
                    onChange({ ...section, links: newLinks })
                  }}
                  placeholder={t('LinksEditor.linkTitlePlaceholder')}
                />
                <Input
                  value={link.url}
                  onChange={e => {
                    const newLinks = [...section.links]
                    newLinks[index] = { ...link, url: e.target.value }
                    onChange({ ...section, links: newLinks })
                  }}
                  placeholder={t('LinksEditor.urlPlaceholder')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newLinks = section.links.filter((_, i) => i !== index)
                    onChange({ ...section, links: newLinks })
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
                const newLink: ProfileLink = {
                  title: '',
                  url: '',
                }
                onChange({
                  ...section,
                  links: [...section.links, newLink],
                })
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('LinksEditor.addLinkButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
