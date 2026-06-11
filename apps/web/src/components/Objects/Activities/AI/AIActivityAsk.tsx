'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import appLogoLight from '@public/app_logo_light.svg'
import { useActivityAIChat } from '@components/Contexts/AI/ActivityAIChatContext'
import { Button } from '@components/ui/button'
import { StudentTutorWorkspace } from '@/features/ai'
import { cn } from '@/lib/utils'

interface Activity {
  activity_uuid: string
  title?: string
  [key: string]: unknown
}

interface AIActivityAskProps {
  activity: Activity
}

const AIActivityAsk = ({ activity }: AIActivityAskProps) => {
  const t = useTranslations('Activities.AIActivityAsk')
  const { isModalOpen, openModal, setIsModalOpen } = useActivityAIChat()

  const handleToggleModal = () => {
    if (isModalOpen) {
      setIsModalOpen(false)
    } else {
      openModal()
    }
  }

  return (
    <>
      <StudentTutorWorkspace
        title={t('AI')}
        description={activity.title ?? t('placeholder')}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
      <Button
        variant="outline"
        size="sm"
        aria-pressed={isModalOpen}
        onClick={handleToggleModal}
        className={cn('h-9 gap-2 rounded-full px-4 text-xs font-semibold', isModalOpen && 'bg-accent')}
      >
        <Image
          className="rounded-sm"
          width={18}
          height={18}
          src={appLogoLight}
          alt={t('askAI')}
          style={{ height: 'auto' }}
        />
        {t('askAI')}
      </Button>
    </>
  )
}

export default AIActivityAsk
