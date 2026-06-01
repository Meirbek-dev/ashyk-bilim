'use client'

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toaster as Sonner } from 'sonner'
import type { ToasterProps } from 'sonner'
import { useTheme } from '@/components/providers/theme-provider'

const Toaster = ({ position = 'top-center', ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <Sonner
      position={position}
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-lime-600" />,
        info: <InfoIcon className="size-4 text-blue-600" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-600" />,
        error: <OctagonXIcon className="size-4 text-rose-600" />,
        loading: <Loader2Icon className="text-muted-foreground size-4 animate-spin" />,
      }}
      style={
        {
          zIndex: 9999,
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />,
    document.body,
  )
}

export { Toaster }
