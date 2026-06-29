'use client'

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isSafeMarkdownImageUrl } from '../utils/markdown-sanitize'
import { useTranslations } from 'next-intl'

interface EditorImageDialogProps {
  onConfirm: (src: string, alt: string) => void
  onClose: () => void
}

export function EditorImageDialog({ onConfirm, onClose }: EditorImageDialogProps) {
  const t = useTranslations('MarkdownEditor')
  const [src, setSrc] = useState('')
  const [alt, setAlt] = useState('')
  const [touched, setTouched] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const srcValid = !src.trim() || isSafeMarkdownImageUrl(src.trim())
  const showError = touched && Boolean(src.trim()) && !srcValid

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleConfirm = () => {
    if (!src.trim() || !srcValid) return
    if (!alt.trim()) {
      setTouched(true)
      return
    }
    onConfirm(src.trim(), alt.trim())
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

  const showPreview = src.trim() && srcValid && !previewFailed

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('imageDialog.title')}
    >
      <div
        className="bg-popover border-border w-[380px] rounded-lg border p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon className="text-muted-foreground size-4" />
          <span className="text-sm font-semibold">{t('imageDialog.title')}</span>
        </div>

        {/* Image URL */}
        <div className="mb-2 space-y-1">
          <Label htmlFor="image-dialog-src" className="text-muted-foreground text-xs">
            {t('imageDialog.srcLabel')}
          </Label>
          <Input
            id="image-dialog-src"
            ref={inputRef}
            value={src}
            onChange={e => {
              setSrc(e.target.value)
              setTouched(true)
              setPreviewFailed(false)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('imageDialog.srcPlaceholder')}
            className={cn(showError && 'border-destructive')}
            aria-invalid={showError}
          />
          {showError && <p className="text-destructive text-xs">{t('imageDialog.srcError')}</p>}
        </div>

        {/* Alt text */}
        <div className="mb-3 space-y-1">
          <Label htmlFor="image-dialog-alt" className="text-muted-foreground text-xs">
            {t('imageDialog.altLabel')}{' '}
            <span className="text-muted-foreground/60">{t('imageDialog.altLabelOptional')}</span>
          </Label>
          <Input
            id="image-dialog-alt"
            value={alt}
            onChange={e => setAlt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('imageDialog.altPlaceholder')}
          />
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="bg-muted/30 mb-3 flex items-center justify-center rounded-md border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || t('imageDialog.preview')}
              className="max-h-32 max-w-full rounded object-contain"
              onError={() => setPreviewFailed(true)}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('imageDialog.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={!src.trim() || !srcValid || !alt.trim()}>
            {t('imageDialog.insert')}
          </Button>
        </div>
      </div>
    </div>
  )
}
