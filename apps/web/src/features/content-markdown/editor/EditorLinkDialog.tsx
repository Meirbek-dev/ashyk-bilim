'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Link, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { isSafeMarkdownUrl } from '../utils/markdown-sanitize'
import { useTranslations } from 'next-intl'

interface EditorLinkDialogProps {
  /** Current href, or undefined if no link is active. */
  currentHref?: string
  /** Called with the new href, or empty string to remove the link. */
  onConfirm: (href: string, openInNewTab: boolean) => void
  onClose: () => void
}

/**
 * Accessible inline link editor — replaces the native browser prompt().
 * Renders as a floating panel anchored to the toolbar.
 */
export function EditorLinkDialog({ currentHref, onConfirm, onClose }: EditorLinkDialogProps) {
  const t = useTranslations('MarkdownEditor')
  const [url, setUrl] = useState(currentHref ?? '')
  const [newTab, setNewTab] = useState(true)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isValid = !url.trim() || isSafeMarkdownUrl(url.trim())
  const showError = touched && Boolean(url.trim()) && !isValid

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleConfirm = () => {
    if (!isValid && url.trim()) return
    onConfirm(url.trim(), newTab)
    onClose()
  }

  const handleRemove = () => {
    onConfirm('', false)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      onClick={onClose}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={currentHref ? t('linkDialog.editTitle') : t('linkDialog.title')}
    >
      {/* Dialog panel */}
      <div
        className="bg-popover border-border w-[360px] rounded-lg border p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Link className="text-muted-foreground size-4" />
          <span className="text-sm font-semibold">
            {currentHref ? t('linkDialog.editTitle') : t('linkDialog.title')}
          </span>
        </div>

        {/* URL input */}
        <div className="mb-2 space-y-1">
          <label htmlFor="link-dialog-url" className="text-muted-foreground text-xs font-medium">
            {t('linkDialog.urlLabel')}
          </label>
          <Input
            id="link-dialog-url"
            ref={inputRef}
            value={url}
            onChange={e => {
              setUrl(e.target.value)
              setTouched(true)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('linkDialog.urlPlaceholder')}
            className={cn(showError && 'border-destructive focus-visible:ring-destructive')}
            aria-invalid={showError}
            aria-describedby={showError ? 'link-dialog-error' : undefined}
          />
          {showError && (
            <p id="link-dialog-error" className="text-destructive text-xs">
              {t('linkDialog.urlError')}
            </p>
          )}
        </div>

        {/* Open in new tab */}
        <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={newTab}
            onChange={e => setNewTab(e.target.checked)}
            className="rounded"
          />
          <ExternalLink className="text-muted-foreground size-3.5" />
          <span>{t('linkDialog.openNewTab')}</span>
        </label>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          {currentHref ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-destructive"
            >
              <Unlink className="mr-1.5 size-3.5" />
              {t('linkDialog.removeLink')}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('linkDialog.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!isValid && !!url.trim()}
            >
              {currentHref ? t('linkDialog.update') : t('linkDialog.insert')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
