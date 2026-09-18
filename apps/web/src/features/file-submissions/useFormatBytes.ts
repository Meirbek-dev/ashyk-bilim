import { useFormatter, useTranslations } from 'next-intl'

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** Localized file size: «1,1 МБ» / «33 Б» in ru and kk, «1.1 MB» in en (UX-108). */
export function useFormatBytes(): (bytes: number) => string {
  const t = useTranslations('FileSubmission.bytes')
  const format = useFormatter()
  return bytes => {
    const idx = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1) : 0
    const unit = UNITS[idx] ?? 'B'
    return t(unit, { value: format.number(bytes / 1024 ** idx, { maximumFractionDigits: idx === 0 ? 0 : 1 }) })
  }
}
