import { ShieldCheckIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { studentSafeVisibility } from '../lib/ai-permissions'
import type { AIRole } from '../lib/ai-permissions'

export function AIPrivacyNotice({ role }: { role: AIRole }) {
  return (
    <Alert>
      <ShieldCheckIcon aria-hidden="true" />
      <AlertTitle>Data scope</AlertTitle>
      <AlertDescription>{studentSafeVisibility(role)}</AlertDescription>
    </Alert>
  )
}
