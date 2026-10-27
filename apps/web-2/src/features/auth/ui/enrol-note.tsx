import { GraduationCap } from 'lucide-react'

import { Alert, AlertDescription } from '#/shared/ui/alert'

import { enrolsAfterAuth } from '../model/login-search'

/** Over the sign-in / sign-up form after a guest's «Записаться»: the enrolment happens right after (B-AUTH-17). */
export function EnrolNote({ redirect, text }: { redirect: string | undefined; text: string }) {
  if (!enrolsAfterAuth(redirect)) return null
  return (
    <Alert>
      {/* With its icon, as every note in the app: a bare bordered line over a form read as one more empty field. */}
      <GraduationCap aria-hidden />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  )
}
