'use client' // Error components must be Client Components
import ErrorUI from '@/components/Objects/Elements/Error/Error'
import { useEffect } from 'react'

export default function Error({ error }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <div>
      <ErrorUI />
    </div>
  )
}
