import type { ComponentType, ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'

interface SectionFrameProps {
  t: AppTranslator
  icon: ComponentType<{ className?: string }>
  heading: string
  title: string
  onTitleChange: (title: string) => void
  children?: ReactNode
}

/** The card every section editor shares: heading, the section title input, then the kind-specific fields. */
export function SectionFrame({ t, icon: Icon, heading, title, onTitleChange, children }: SectionFrameProps) {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <Icon className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{heading}</h3>
      </div>
      <div className="space-y-4">
        <div>
          <Label htmlFor="section-title">{t('Common.sectionTitle')}</Label>
          <Input
            id="section-title"
            value={title}
            onChange={e => {
              onTitleChange(e.target.value)
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>
        {children}
      </div>
    </div>
  )
}

export function AddItemButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="w-full">
      <Plus className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}

export function RemoveItemButton({
  label,
  onClick,
  iconOnly,
}: {
  label: string
  onClick: () => void
  iconOnly?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      aria-label={label}
      onClick={onClick}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className={iconOnly ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
      {iconOnly ? null : label}
    </Button>
  )
}

/** `items` with element `index` replaced by `{...item, ...patch}`. */
export function patchAt<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item))
}
