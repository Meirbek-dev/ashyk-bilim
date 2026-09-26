import CertificateVerificationPage from '@components/Pages/Certificate/CertificateVerificationPage'
import { getCertificateByCode } from '@services/courses/certifications'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'

interface CertificateVerifyPageProps {
  params: Promise<{
    uuid: string
  }>
}

export async function generateMetadata(props: CertificateVerifyPageProps): Promise<Metadata> {
  const { uuid } = await props.params
  const t = await getTranslations('Certificates.CertificateVerifyPage')

  try {
    const result = await getCertificateByCode(uuid)

    if (result.data) {
      const certificateData = result.data
      const rawName = certificateData.certification.config.certification_name
      const certificationName = typeof rawName === 'string' ? rawName : ''
      const courseName = certificateData.course.name ?? ''

      return {
        title: t('title', { certificationName, courseName }),
        description: t('description', { certificationName, courseName }),
        keywords: t('keywords', { certificationName, courseName }),
        robots: {
          index: true,
          follow: true,
          nocache: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
          },
        },
        openGraph: {
          title: t('openGraph.title', { certificationName, courseName }),
          description: t('openGraph.description', {
            certificationName,
            courseName,
          }),
          type: 'website',
          siteName: t('openGraph.siteName'),
        },
      }
    }
  } catch (error) {
    console.error('Error fetching certificate for metadata:', error)
  }

  return {
    title: t('fallback.title'),
    description: t('fallback.description'),
    robots: {
      index: false,
      follow: false,
    },
  }
}

async function CertificateVerify({ params }: CertificateVerifyPageProps) {
  const { uuid } = await params
  return <CertificateVerificationPage certificateUuid={uuid} />
}

// The code comes from the URL and the metadata reads a live verification, so
// the page renders per request; the boundary keeps Cache Components' dev
// notices (uncached data in generateMetadata, URL data outside <Suspense>) off
// the console.
export default function PlatformCertificateVerifyPage(props: CertificateVerifyPageProps) {
  return (
    <Suspense fallback={null}>
      <CertificateVerify {...props} />
    </Suspense>
  )
}
