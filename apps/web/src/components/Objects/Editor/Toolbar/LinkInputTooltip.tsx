import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LinkInputTooltipProps {
  onSave: (url: string) => void
  onCancel: () => void
  currentUrl?: string
}

const LinkInputTooltip = ({ onSave, onCancel, currentUrl = '' }: LinkInputTooltipProps) => {
  const [url, setUrl] = useState(currentUrl)
  const t = useTranslations('DashPage.Editor.LinkInputTooltip')

  const handleSubmit = (formData: FormData) => {
    const nextUrl = String(formData.get('url') ?? '').trim()

    if (nextUrl) {
      // Ensure the URL has a protocol
      const formattedUrl =
        nextUrl.startsWith('http://') || nextUrl.startsWith('https://')
          ? nextUrl
          : `https://${nextUrl}`
      onSave(formattedUrl)
    }
  }

  const inputId = useId()

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="border-border bg-popover absolute top-full left-0 z-[1000] mt-1.5 rounded-lg border p-2 shadow-md">
      <form action={handleSubmit} className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          {t('enterUrl')}
        </label>
        <Input
          id={inputId}
          name="url"
          type="text"
          autoComplete="url"
          placeholder={t('enterUrl')}
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-52 text-xs"
        />
        <div className="flex gap-1">
          <Button
            type="submit"
            disabled={!url.trim()}
            variant="ghost"
            size="icon"
            title={t('saveLink')}
          >
            <Check size={16} />
          </Button>
          <Button type="button" onClick={onCancel} variant="ghost" size="icon" title={t('cancel')}>
            <X size={16} />
          </Button>
        </div>
      </form>
    </div>
  )
}

export default LinkInputTooltip
