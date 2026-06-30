import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

interface AIConfidenceMeterProps {
  confidence?: 'low' | 'medium' | 'high' | string | null | undefined
}

export function AIConfidenceMeter({ confidence }: AIConfidenceMeterProps) {
  const t = useTranslations('AIConfidenceMeter')
  const normalized = confidence === 'high' || confidence === 'medium' || confidence === 'low' ? confidence : 'low'
  const variant = normalized === 'high' ? 'success' : normalized === 'medium' ? 'warning' : 'outline'
  return <Badge variant={variant}>{t(normalized)}</Badge>
}
