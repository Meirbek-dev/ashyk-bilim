import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import * as v from 'valibot'

import { storageItem } from '#/shared/lib/storage'

import { dayOf } from '../model/achievements'
import { recordLoginOptions } from '../queries'

const touched = storageItem('ab.loginStreakDay', v.number(), 'session')

/**
 * The login streak moves only by this call (the server does not touch it at sign-in): /home records it once per
 * UTC day per browser session. The day is marked before the request, so a failure is not retried until tomorrow.
 */
export function useLoginStreak() {
  const { mutate } = useMutation(recordLoginOptions(useQueryClient()))
  useEffect(() => {
    const today = dayOf(Date.now() / 1000)
    if (touched.get() === today) return
    touched.set(today)
    mutate({ path: { kind: 'login' } })
  }, [mutate])
}
