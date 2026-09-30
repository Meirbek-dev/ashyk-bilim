'use client'

import UserAvatar from '@components/Objects/UserAvatar'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { Send } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { hasMeaningfulText } from './text'

const RichTextEditor = dynamic(
  () =>
    import('@components/Objects/Editor/views/DiscussionEditor').then(m => ({
      default: m.DiscussionEditor,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted/40 h-[120px] w-full animate-pulse rounded-lg border" />,
  },
)

interface DiscussionFormProps {
  currentUser: AppUserSummary
  onSubmit: (content: string) => void
}

export default function DiscussionForm({ currentUser, onSubmit }: DiscussionFormProps) {
  const t = useTranslations('CoursePage')
  const [content, setContent] = useState('')
  // A one-line prompt until the reader wants to write; the full editor toolbar stays out of the way.
  const [expanded, setExpanded] = useState(false)

  const handleSubmit = (formData: FormData) => {
    const nextContent = String(formData.get('content') ?? '')

    if (!hasMeaningfulText(nextContent)) return
    onSubmit(nextContent)
    setContent('')
    setExpanded(false)
  }

  const isContentEmpty = !hasMeaningfulText(content)

  if (!expanded) {
    return (
      <div className="bg-card text-card-foreground flex items-center gap-3 rounded-lg border p-3 shadow-sm">
        <UserAvatar size="sm" variant="default" username={currentUser?.username} />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-muted-foreground hover:border-ring flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors"
        >
          {t('startDiscussionPlaceholder')}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground rounded-lg border p-5 shadow-sm">
      <form action={handleSubmit} className="space-y-4">
        <input type="hidden" name="content" value={content} />
        <div className="flex items-start gap-4">
          <UserAvatar size="md" variant="default" username={currentUser?.username} />
          <div className="flex-1">
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder={t('startDiscussionPlaceholder')}
              minHeight="120px"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setExpanded(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={isContentEmpty} className="flex items-center gap-2">
            <Send size={16} />
            <span>{t('postDiscussion')}</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
