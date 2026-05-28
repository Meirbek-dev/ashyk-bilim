'use client'

import { useServerInsertedHTML } from 'next/navigation'
import { useEffect } from 'react'

interface HtmlLangSyncProps {
  locale: string
}

export function HtmlLangSync({ locale }: HtmlLangSyncProps) {
  useServerInsertedHTML(() => {
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang=${JSON.stringify(locale)};`,
        }}
      />
    )
  })

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return null
}
