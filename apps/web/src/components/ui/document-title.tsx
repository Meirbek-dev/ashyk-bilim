'use client'

import { useEffect } from 'react'

// For routes that cannot export metadata (`not-found.tsx`): a hoisted <title>
// is dropped by the metadata slot, so set it after mount instead.
export default function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title
  }, [title])
  return null
}
