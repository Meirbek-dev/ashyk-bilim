'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getEmbedProvider } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options'
import type { EmbedType } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options'

interface EmbedUrlFormProps {
  type: EmbedType
  url: string
  onChange: (url: string) => void
  error: string | null
  onErrorChange: (error: string | null) => void
}

export function EmbedUrlForm({ type, url, onChange, error, onErrorChange }: EmbedUrlFormProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel')
  const inputId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const provider = getEmbedProvider(type)
  const hasError = error !== null

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (hasError) {
      onErrorChange(null)
    }
    onChange(event.target.value)
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={inputId}>
          {provider
            ? t('urlForService', {
                service: t(`providers.${provider.type}.label`),
              })
            : t('urlLabel')}
        </Label>
        {provider ? (
          <p id={descriptionId} className="text-muted-foreground text-xs">
            {t(`providers.${provider.type}.description`)}
          </p>
        ) : null}
      </div>
      <Input
        id={inputId}
        type="url"
        value={url}
        onChange={handleChange}
        placeholder={provider?.placeholder ?? t('urlPlaceholder')}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : provider ? descriptionId : undefined}
        autoComplete="url"
        spellCheck={false}
      />
      {hasError ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {t(error as 'errorEmpty' | 'errorInvalid')}
        </p>
      ) : null}
      {provider?.requiresEmbedUrl ? <p className="text-muted-foreground text-xs">{t('embedUrlHint')}</p> : null}
    </div>
  )
}
