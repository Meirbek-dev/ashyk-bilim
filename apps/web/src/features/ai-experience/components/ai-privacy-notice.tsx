import { ShieldCheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { AIRole } from '../lib/ai-permissions'

export function AIPrivacyNotice({ aiRole }: { aiRole: AIRole }) {
  const t = useTranslations('AiExperience.privacyNotice')
  return (
    <Alert>
      <ShieldCheckIcon aria-hidden="true" />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{aiRole === 'student' ? t('studentScope') : t('teacherScope')}</AlertDescription>
    </Alert>
  )
}
