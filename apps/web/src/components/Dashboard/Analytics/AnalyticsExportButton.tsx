'use client'

import { Download, Loader2 } from 'lucide-react'
import { downloadAnalyticsExport } from '@services/analytics/teacher'
import { Button } from '@/components/ui/button'
import { useApiError } from '@/hooks/useApiError'
import { useSession } from '@/hooks/useSession'
import { canExportAnalytics } from '@/lib/rbac/navigation-policy'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

interface AnalyticsExportButtonProps {
  href: string
  label: string
}

/** Rendered only with an `analytics:export` grant (UX-114); the CSV follows the UI locale. */
export default function AnalyticsExportButton({ href, label }: AnalyticsExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const t = useTranslations('TeacherAnalytics.overview')
  const locale = useLocale()
  const { can } = useSession()
  const { toastApiError } = useApiError()

  if (!canExportAnalytics(can)) return null

  const handleDownload = async () => {
    setLoading(true)
    try {
      const { blob, filename } = await downloadAnalyticsExport(href, locale)
      const url = globalThis.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.download = filename
      anchor.href = url
      anchor.click()
      globalThis.URL.revokeObjectURL(url)
      toast.success(t('exportSaved'))
    } catch (error) {
      toastApiError(error, { fallback: t('exportFailed') })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label}
    </Button>
  )
}
