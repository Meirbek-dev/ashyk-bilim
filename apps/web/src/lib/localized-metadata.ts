import type { Locale } from '@/i18n/config'
import { defaultLocale, locales } from '@/i18n/config'
import enUSMessages from '@/messages/en-US.json'
import kkKZMessages from '@/messages/kk-KZ.json'
import ruRUMessages from '@/messages/ru-RU.json'

interface StaticMetadataMessages {
  General: {
    home: string
    courses: string
    learning: string
    education: string
    onlineLearning: string
    onlineCourses: string
  }
  DashPage: {
    Admin: {
      Index: {
        title: string
        description: string
      }
    }
  }
  Components: {
    Roles: {
      title: string
      cardDescription: string
      userRolesTitle: string
      userRolesDescription: string
    }
  }
}

const messagesByLocale: Record<Locale, StaticMetadataMessages> = {
  'en-US': enUSMessages as StaticMetadataMessages,
  'kk-KZ': kkKZMessages as StaticMetadataMessages,
  'ru-RU': ruRUMessages as StaticMetadataMessages,
}

export function getStaticMetadataMessages(locale: string): StaticMetadataMessages {
  return messagesByLocale[locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale]
}
