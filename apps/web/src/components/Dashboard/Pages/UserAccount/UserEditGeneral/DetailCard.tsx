'use client'

import { useState } from 'react'
import type { ChangeEvent, ElementType } from 'react'
import { useTranslations } from 'next-intl'
import { useDebouncedCallback } from '@/hooks/useDebounce'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import type { DetailItem } from './schema'
import {
  Briefcase,
  GraduationCap,
  MapPin,
  Building2,
  Lightbulb,
  Globe,
  Laptop2,
  Award,
  BookOpen,
  Link,
  Users,
  Calendar,
} from 'lucide-react'

const iconComponentMap = {
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  speciality: Lightbulb,
  globe: Globe,
  'laptop-2': Laptop2,
  award: Award,
  'book-open': BookOpen,
  link: Link,
  users: Users,
  calendar: Calendar,
}

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = iconComponentMap[iconName as keyof typeof iconComponentMap]
  if (!IconElement) return null
  return <IconElement className="h-4 w-4" />
}

interface DetailCardProps {
  id: string
  detail: DetailItem
  onUpdate: (id: string, field: keyof DetailItem, value: string) => void
  onRemove: (id: string) => void
  onLabelChange: (id: string, newLabel: string) => void
  availableIcons: readonly {
    name: string
    label: string
    component: ElementType
  }[]
}

export const DetailCard = ({ id, detail, onUpdate, onRemove, onLabelChange, availableIcons }: DetailCardProps) => {
  const [localLabel, setLocalLabel] = useState(() => detail.label)
  const [isUserInput, setIsUserInput] = useState(false)
  const t = useTranslations('DashPage.UserAccountSettings.generalSection')

  const iconItems = availableIcons.map(icon => ({
    value: icon.name,
    label: (
      <div className="flex items-center gap-2">
        <icon.component className="h-4 w-4" />
        <span>{icon.label}</span>
      </div>
    ),
  }))

  const stableLabelChangeCallback = (newLabel: string) => {
    if (isUserInput && newLabel !== detail.label) {
      onLabelChange(id, newLabel)
    }
  }

  const debouncedLabelChange = useDebouncedCallback(stableLabelChangeCallback, 500)

  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newLabel = e.target.value
    setLocalLabel(newLabel)
    setIsUserInput(true)
    debouncedLabelChange(newLabel)
  }

  const handleIconChange = (value: string) => {
    onUpdate(id, 'icon', value)
  }

  const handleTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdate(id, 'text', e.target.value)
  }

  const handleRemove = () => {
    onRemove(id)
  }

  return (
    <div className="bg-card ring-foreground/10 space-y-2 rounded-lg p-4 ring-1">
      <div className="mb-3 flex items-center justify-between">
        <Input
          value={localLabel}
          onChange={handleLabelChange}
          placeholder={t('detailLabelPlaceholder')}
          className="max-w-[200px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleRemove}
        >
          {t('detailRemove')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('detailIconLabel')}</Label>
          <Select value={detail.icon} onValueChange={value => value && handleIconChange(value)} items={iconItems}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('detailSelectIconPlaceholder')}>
                {detail.icon ? (
                  <div className="flex items-center gap-2">
                    <IconComponent iconName={detail.icon} />
                    <span>{availableIcons.find(i => i.name === detail.icon)?.label}</span>
                  </div>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {iconItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('detailTextLabel')}</Label>
          <Input value={detail.text} onChange={handleTextChange} placeholder={t('detailTextPlaceholder')} />
        </div>
      </div>
    </div>
  )
}
