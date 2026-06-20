'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Globe2, Sparkles, BookOpen, ExternalLink, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react'
import * as Si from '@icons-pack/react-simple-icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getEmbedProvider } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options'
import type { EmbedType } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options'

type AppIcon = React.ComponentType<{ className?: string }>

interface EmbedUrlFormProps {
  type: EmbedType
  url: string
  onChange: (url: string) => void
  error: string | null
  onErrorChange: (error: string | null) => void
}

function getSimpleIcon(iconName?: string): AppIcon | null {
  if (!iconName) return null
  const iconCandidate = (Si as Record<string, unknown>)[iconName]
  return typeof iconCandidate === 'function' ? (iconCandidate as AppIcon) : null
}

function parseBoldText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="text-foreground font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

export function EmbedUrlForm({ type, url, onChange, error, onErrorChange }: EmbedUrlFormProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel')
  const inputId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const provider = getEmbedProvider(type)
  const hasError = error !== null
  const isValid = url.trim() !== '' && !hasError

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (hasError) {
      onErrorChange(null)
    }
    onChange(event.target.value)
  }

  const Icon = getSimpleIcon(provider?.iconName)
  const FallbackIcon = Globe2
  const hasInstructions = typeof t.has === 'function' && t.has(`providers.${provider?.type}.instructions`)
  const instructionsString = hasInstructions && provider ? t(`providers.${provider.type}.instructions`) : null

  return (
    <div className="space-y-5">
      {/* Premium Selected Service Banner */}
      {provider && (
        <div className="flex items-start gap-3 border-b pb-4">
          <div className="bg-background flex size-12 shrink-0 items-center justify-center rounded-xl border shadow-sm">
            {Icon ? <Icon className="size-6" /> : <FallbackIcon className="text-muted-foreground/60 size-6" />}
          </div>
          <div className="space-y-0.5">
            <h3 className="text-foreground text-sm font-semibold">{t(`providers.${provider.type}.label`)}</h3>
            <p className="text-muted-foreground text-xs leading-normal">
              {t(`providers.${provider.type}.description`)}
            </p>
          </div>
        </div>
      )}

      {/* Input Group */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId} className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('urlLabel')}
          </Label>

          <div className="flex items-center gap-3">
            {provider?.helpUrl && (
              <a
                href={provider.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
              >
                <BookOpen className="size-3.5" />
                {t('viewDocs')}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        <div className="relative">
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
            className="pr-10"
          />
          <div className="absolute inset-y-0 right-3 flex items-center">
            {isValid && <CheckCircle2 className="size-4 text-emerald-500" />}
            {hasError && <AlertCircle className="text-destructive size-4" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="min-h-[1.25rem]">
            {hasError && (
              <p id={errorId} role="alert" className="text-destructive flex items-center gap-1 text-xs">
                <AlertCircle className="size-3.5" />
                {t(error as 'errorEmpty' | 'errorInvalid')}
              </p>
            )}
            {isValid && (
              <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
                <CheckCircle2 className="size-3.5" />
                {t('urlValid')}
              </p>
            )}
          </div>

          {provider?.exampleUrl && (
            <button
              type="button"
              onClick={() => {
                onErrorChange(null)
                onChange(provider.exampleUrl!)
              }}
              className="text-primary hover:bg-primary/10 border-primary/20 bg-primary/5 inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
            >
              <Sparkles className="size-3" />
              {t('useExample')}
            </button>
          )}
        </div>
      </div>

      {/* Guidance / Instructions Block */}
      {provider && (
        <div className="border-border bg-muted/20 space-y-2.5 rounded-lg border p-3.5">
          <div className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
            <HelpCircle className="text-muted-foreground size-4" />
            <span>{t('howToGetLink')}</span>
          </div>

          <div className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
            {instructionsString ? (
              instructionsString.split('\n').map((line, idx) => (
                <p key={idx} className="flex items-start gap-1">
                  <span className="text-muted-foreground/60 font-bold select-none">•</span>
                  <span>{parseBoldText(line)}</span>
                </p>
              ))
            ) : (
              <p className="flex items-start gap-1">
                <span className="text-muted-foreground/60 font-bold select-none">•</span>
                <span>{parseBoldText(t('defaultInstructions'))}</span>
              </p>
            )}
          </div>

          {provider.requiresEmbedUrl && (
            <div className="flex items-start gap-1.5 rounded border border-amber-200/20 bg-amber-500/5 p-2 text-xs leading-normal font-medium text-amber-600 dark:text-amber-500">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{t('embedUrlHint')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
