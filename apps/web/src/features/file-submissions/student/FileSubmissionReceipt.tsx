'use client'

import { CheckCircle2, Clock, Files, Hash } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import type { FileSubmissionAttempt } from '@/features/file-submissions/services/file-submissions'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FileSubmissionReceiptProps {
  attempt: FileSubmissionAttempt
}

/**
 * Immutable submission receipt shown after the student submits their work.
 * Displays submitted timestamp, attempt number, file list, and late indicator.
 */
export default function FileSubmissionReceipt({ attempt }: FileSubmissionReceiptProps) {
  const t = useTranslations('FileSubmission')
  return (
    <div className="bg-muted/30 border-border mx-auto max-w-2xl space-y-4 rounded-xl border p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="font-semibold">{t('submissionReceived')}</h3>
          {attempt.submitted_at ? (
            <p className="text-muted-foreground text-sm">{formatDateTime(attempt.submitted_at)}</p>
          ) : null}
        </div>
        {attempt.is_late ? (
          <Badge variant="destructive" className="ml-auto">
            {t('late')}
          </Badge>
        ) : null}
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <MetaCell
          icon={<Hash className="size-4" />}
          label={t('attempt')}
          value={`#${attempt.attempt_number}`}
        />
        <MetaCell
          icon={<Files className="size-4" />}
          label={t('files')}
          value={String(attempt.files.length)}
        />
        <MetaCell
          icon={<Clock className="size-4" />}
          label={t('statusLabel')}
          value={t('awaitingReview')}
        />
      </div>

      {/* File list */}
      {attempt.files.length > 0 ? (
        <div className="border-border divide-border rounded-lg border">
          {attempt.files.map(file => (
            <div
              key={file.attempt_file_uuid}
              className="flex items-center gap-3 p-3 text-sm last:border-b-0"
            >
              <CheckCircle2 className="text-primary size-4 shrink-0" />
              <span className="min-w-0 truncate">{file.filename}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MetaCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-background border-border flex flex-col gap-0.5 rounded-lg border p-3">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
