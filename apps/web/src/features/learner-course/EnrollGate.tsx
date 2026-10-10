'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useApiError } from '@/hooks/useApiError'
import { apiJson } from '@/lib/api-client'
import { revalidateTags } from '@/lib/cache/revalidate'
import { queryKeys } from '@/lib/react-query/queryKeys'

/** Attempt-state / file-task reason: the course takes assessments from enrolled learners only. */
export const NOT_ENROLLED = 'NOT_ENROLLED'

/**
 * Cluster G: the reason and «Записаться на курс» where the server said
 * `NOT_ENROLLED`; the page follows the enrolment without a reload.
 */
export function EnrollGate({ courseId }: { courseId: string }) {
  const t = useTranslations('AttemptActions')
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const enroll = useMutation({
    mutationFn: () => apiJson(`enrollments/${courseId}`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('enrolledToast'))
      await Promise.all([
        revalidateTags(['courses']),
        queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
        queryClient.invalidateQueries({ queryKey: ['learner-course'] }),
        queryClient.invalidateQueries({ queryKey: ['student-activity'] }),
        queryClient.invalidateQueries({ queryKey: ['assessments'] }),
        queryClient.invalidateQueries({ queryKey: ['file-submission'] }),
      ])
    },
    onError: error => toastApiError(error, { fallback: t('enrollFailed') }),
  })

  return (
    <div className="flex flex-col items-center gap-3" data-testid="enroll-gate">
      <p className="text-muted-foreground max-w-md text-sm">{t('blockedReasons.NOT_ENROLLED')}</p>
      <Button onClick={() => enroll.mutate()} disabled={enroll.isPending}>
        {enroll.isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        {t('enrollToTake')}
      </Button>
    </div>
  )
}
