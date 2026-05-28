import { getPlatformThumbnailImage } from '@services/media/media'
import { APP_NAME } from '@/lib/constants'
import { getSearchParam, type PageSearchParams } from '@/lib/search-params'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import SearchPage from '@/app/_shared/withmenu/search/search'

interface MetadataProps {
  searchParams: Promise<PageSearchParams>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const searchParams = await props.searchParams
  const t = await getTranslations('General')
  const searchQuery = getSearchParam(searchParams, 'q') ?? ''
  const searchType = getSearchParam(searchParams, 'type') ?? 'all'

  let title = `${t('search')} - ${APP_NAME}`
  let description = `${t('searchContent')} ${APP_NAME}. ${t('discoverCourses')}, ${t('collections')}, ${t('andUsers')}.`

  if (searchQuery) {
    title = `${t('searchResults')} "${searchQuery}" - ${APP_NAME}`
    description = `${t('searchResultsFor')} "${searchQuery}" ${t('in')} ${APP_NAME}. ${t('findCourses')}, ${t('collections')}, ${t('andUsers')}.`
  }

  if (searchType !== 'all' && searchType) {
    const typeLabel = t(searchType as 'courses' | 'collections' | 'users')
    title = searchQuery
      ? `${typeLabel} ${t('searchResults')} "${searchQuery}" - ${APP_NAME}`
      : `${typeLabel} - ${APP_NAME}`
    description = searchQuery
      ? `${t('searchResultsFor')} "${searchQuery}" ${t('in')} ${typeLabel.toLowerCase()} ${t('at')} ${APP_NAME}.`
      : `${t('browse')} ${typeLabel.toLowerCase()} ${t('at')} ${APP_NAME}.`
  }

  const keywords = [
    APP_NAME,
    t('search'),
    t('courses'),
    t('collections'),
    t('users'),
    t('learning'),
    t('education'),
    t('onlineLearning'),
    t('edu'),
    searchQuery,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    title,
    description,
    keywords,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: APP_NAME,
      images: [
        {
          url: getPlatformThumbnailImage(),
          width: 800,
          height: 600,
          alt: `${APP_NAME} - ${t('search')}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [getPlatformThumbnailImage()],
    },
    alternates: {
      canonical: searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : '/search',
    },
  }
}

export default async function PlatformSearchPage() {
  return (
    <div>
      <SearchPage />
    </div>
  )
}
