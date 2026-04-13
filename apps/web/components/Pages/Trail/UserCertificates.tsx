'use client';

import { Award, Building, Calendar, ExternalLink, Hash } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { useFormatter, useTranslations } from 'next-intl';
import { useUserCertificates } from '@/features/certifications/hooks/useCertifications';
import Link from '@components/ui/AppLink';
import type React from 'react';

const UserCertificates: React.FC = () => {
  const format = useFormatter();
  const t = useTranslations('Certificates.UserCertificates');

  const { data: certificates, error, isLoading } = useUserCertificates();

  if (isLoading) {
    return (
      <div className="border-border bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Award className="text-primary h-6 w-6" />
          <h2 className="text-foreground text-xl font-semibold">{t('myCertificates')}</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-muted h-20 rounded-lg"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-border bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Award className="text-primary h-6 w-6" />
          <h2 className="text-foreground text-xl font-semibold">{t('myCertificates')}</h2>
        </div>
        <div className="py-8 text-center">
          <p className="text-muted-foreground">{t('failedToLoadCertificates')}</p>
        </div>
      </div>
    );
  }

  // Handle the actual API response structure - certificates are returned as an array directly
  const certificatesData = Array.isArray(certificates) ? certificates : certificates?.data || [];

  if (!certificatesData || certificatesData.length === 0) {
    return (
      <div className="border-border bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Award className="text-primary h-6 w-6" />
          <h2 className="text-foreground text-xl font-semibold">{t('myCertificates')}</h2>
        </div>
        <div className="py-8 text-center">
          <Award className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
          <p className="text-muted-foreground">{t('noCertificatesEarned')}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t('completeCoursesToEarn')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="mb-6 flex items-center gap-3">
        <Award className="text-primary h-6 w-6" />
        <h2 className="text-foreground text-xl font-semibold">{t('myCertificates')}</h2>
        <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
          {certificatesData.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {certificatesData.map((certificate: any) => {
          const verificationLink = getAbsoluteUrl(
            `/certificates/${certificate.certificate_user.user_certification_uuid}/verify`,
          );
          const awardedDate = format.dateTime(new Date(certificate.certificate_user.created_at), {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            // Use Almaty timezone to avoid ENVIRONMENT_FALLBACK errors and match the platform locale
            timeZone: 'Asia/Almaty',
          });

          return (
            <div
              key={certificate.certificate_user.user_certification_uuid}
              className="border-border rounded-lg border p-4 transition-shadow hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="text-primary h-4 w-4" />
                  <h3 className="text-foreground truncate text-sm font-semibold">
                    {certificate.certification.config.certification_name}
                  </h3>
                </div>

                <div className="text-muted-foreground space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Building className="h-3 w-3" />
                    <span className="truncate">{certificate.course.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {t('awardedOn')} {awardedDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Hash className="h-3 w-3" />
                    <span className="bg-muted text-foreground truncate rounded px-2 py-1 font-mono text-xs">
                      {certificate.certificate_user.user_certification_uuid}
                    </span>
                  </div>
                </div>

                <div className="border-border flex items-center justify-between border-t pt-2">
                  <div className="text-muted-foreground text-xs capitalize">
                    {certificate.certification.config.certification_type.replace('_', ' ')}
                  </div>
                  <Link
                    prefetch={false}
                    href={verificationLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
                  >
                    <span>{t('verifyCertificate')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UserCertificates;
