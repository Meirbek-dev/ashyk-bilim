'use client'

import { CheckCircle2, FileWarning, Loader2, Paperclip, Trash2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FileSlotStatus = 'queued' | 'uploading' | 'saved' | 'failed'

export interface PendingFileSlot {
  id: string
  file: File
  upload_uuid?: string
  status: FileSlotStatus
  progress: number // 0–100
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FileUploadSlotProps {
  slot: PendingFileSlot
  onRemove?: (id: string) => void
  /** When true the remove button is hidden (e.g. after submit) */
  readonly?: boolean
}

/**
 * A single row showing a file's upload state with a progress bar.
 */
export default function FileUploadSlot({ slot, onRemove, readonly = false }: FileUploadSlotProps) {
  const t = useTranslations('FileSubmission')
  const isUploading = slot.status === 'uploading'
  const isSaved = slot.status === 'saved'
  const isFailed = slot.status === 'failed'

  return (
    <div className="group border-border flex flex-col gap-1.5 border-b p-3 last:border-b-0">
      <div className="flex items-center gap-3">
        {/* File icon / status icon */}
        <span className="shrink-0">
          {isUploading ? (
            <Loader2 className="text-primary size-4 animate-spin" />
          ) : isSaved ? (
            <CheckCircle2 className="text-primary size-4" />
          ) : isFailed ? (
            <XCircle className="text-destructive size-4" />
          ) : (
            <Paperclip className="text-muted-foreground size-4" />
          )}
        </span>

        {/* File name + size */}
        <div className="min-w-0 flex-1">
          <p
            className={cn('truncate text-sm font-medium', isFailed && 'text-destructive')}
            title={slot.file.name}
          >
            {slot.file.name}
          </p>
          <p className="text-muted-foreground text-xs">{formatBytes(slot.file.size)}</p>
        </div>

        {/* Remove */}
        {!readonly && onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onRemove(slot.id)}
            aria-label={t('removeFile', { name: slot.file.name })}
            disabled={isUploading}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      {/* Progress bar */}
      {isUploading ? (
        <div className="bg-muted h-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-200"
            style={{ width: `${slot.progress}%` }}
          />
        </div>
      ) : null}

      {/* Error message */}
      {isFailed && slot.error ? (
        <p className="text-destructive flex items-center gap-1 text-xs">
          <FileWarning className="size-3 shrink-0" />
          {slot.error}
        </p>
      ) : null}
    </div>
  )
}
