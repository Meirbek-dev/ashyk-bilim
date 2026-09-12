'use client'

import { Download, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useApiError } from '@/hooks/useApiError'
import { apiBody } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/** The server-rendered certificate (`GET certificates/{code}/pdf`) in the UI language, as a Blob. */
export function downloadCertificatePdf(verifyCode: string, locale: string): Promise<Blob> {
  return apiBody<Blob, 'blob'>(`certificates/${encodeURIComponent(verifyCode)}/pdf`, {
    responseType: 'blob',
    headers: { 'Accept-Language': locale },
  })
}

interface CertificatePdfDownloadButtonProps {
  verifyCode: string
  className?: string
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline' | 'secondary' | 'link'
}

/** «Скачать PDF»: fetch with the session cookie, hand the Blob to the browser, toast the outcome. */
export function CertificatePdfDownloadButton({
  verifyCode,
  className,
  size = 'sm',
  variant = 'outline',
}: CertificatePdfDownloadButtonProps) {
  const t = useTranslations('Certificates.Pdf')
  const locale = useLocale()
  const { toastApiError } = useApiError()
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const blob = await downloadCertificatePdf(verifyCode, locale)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `certificate-${verifyCode}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(t('downloaded'))
    } catch (error) {
      toastApiError(error, undefined, t('failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn('gap-1.5', className)}
      onClick={() => void handleDownload()}
      disabled={loading}
      aria-busy={loading}
      data-testid="certificate-pdf-download"
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      <span>{loading ? t('preparing') : t('download')}</span>
    </Button>
  )
}
