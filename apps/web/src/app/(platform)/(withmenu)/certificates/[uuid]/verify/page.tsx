import CertificateVerificationPage from '@components/Pages/Certificate/CertificateVerificationPage';
import { getCertificateByUuid } from '@services/courses/certifications';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type React from 'react';

interface CertificateVerifyPageProps {
  params: Promise<{
    uuid: string;
  }>;
}

export async function generateMetadata(props: CertificateVerifyPageProps): Promise<Metadata> {
  const { uuid } = await props.params;
  const t = await getTranslations('Certificates.CertificateVerifyPage');

  try {
    const result = await getCertificateByUuid(uuid);

    if (result.success && result.data) {
      const certificateData = result.data;
      const certificationName = certificateData.certification.config.certification_name;
      const courseName = certificateData.course.name;

      return {
        title: t('title', { certificationName, courseName }),
        description: t('description', { certificationName, courseName }),
        keywords: t('keywords', { certificationName, courseName }),
        robots: {
          index: true,
          follow: true,
          nocache: true,
          googleBot: {
            'index': true,
            'follow': true,
            'max-image-preview': 'large',
          },
        },
        openGraph: {
          title: t('openGraph.title', { certificationName, courseName }),
          description: t('openGraph.description', { certificationName, courseName }),
          type: 'website',
          siteName: t('openGraph.siteName'),
        },
      };
    }
  } catch (error) {
    console.error('Error fetching certificate for metadata:', error);
  }

  return {
    title: t('fallback.title'),
    description: t('fallback.description'),
    robots: {
      index: false,
      follow: false,
    },
  };
}

const PlatformCertificateVerifyPage: React.FC<CertificateVerifyPageProps> = async ({ params }) => {
  const { uuid } = await params;
  return <CertificateVerificationPage certificateUuid={uuid} />;
};

export default PlatformCertificateVerifyPage;
