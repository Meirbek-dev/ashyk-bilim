'use client';

import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { AlertTriangle, ArrowLeft, CheckCircle, Loader2, Shield, XCircle } from 'lucide-react';
import { useCertificateByUuid } from '@/features/certifications/hooks/useCertifications';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { getAbsoluteUrl } from '@services/config/config';
import { useLocale, useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import Link from '@components/ui/AppLink';
import type React from 'react';

interface CertificateVerificationPageProps {
  certificateUuid: string;
}

const CertificateVerificationPage: React.FC<CertificateVerificationPageProps> = ({ certificateUuid }) => {
  const locale = useLocale();
  const t = useTranslations('Certificates.CertificateVerificationPage');
  const certificateQuery = useCertificateByUuid(certificateUuid);
  const certificateData = certificateQuery.data?.data ?? null;
  const isLoading = certificateQuery.isPending;
  const error = certificateQuery.error
    ? t('verificationFailed')
    : !isLoading && !certificateData
      ? t('certificateNotFound')
      : null;
  const verificationStatus: 'valid' | 'invalid' | 'loading' = isLoading
    ? 'loading'
    : certificateData
      ? 'valid'
      : 'invalid';

  // Certificate type translation helper
  const getCertificationTypeLabel = (type: string): string => {
    const typeKey = type as keyof typeof t;
    return t(typeKey) || t('completion');
  };

  const getVerificationStatusIcon = () => {
    switch (verificationStatus) {
      case 'valid': {
        return <CheckCircle className="h-8 w-8 text-green-600" />;
      }
      case 'invalid': {
        return <XCircle className="h-8 w-8 text-red-600" />;
      }
      case 'loading': {
        return <AlertTriangle className="h-8 w-8 text-yellow-600" />;
      }
      default: {
        return <AlertTriangle className="h-8 w-8 text-yellow-600" />;
      }
    }
  };

  const getVerificationStatusText = () => {
    switch (verificationStatus) {
      case 'valid': {
        return t('certificateVerified');
      }
      case 'invalid': {
        return t('certificateNotFound');
      }
      case 'loading': {
        return t('verifyingCertificate');
      }
      default: {
        return t('verificationStatusUnknown');
      }
    }
  };

  const getVerificationStatusColor = () => {
    switch (verificationStatus) {
      case 'valid': {
        return 'text-green-600 bg-green-50 border-green-200';
      }
      case 'invalid': {
        return 'text-red-600 bg-red-50 border-red-200';
      }
      case 'loading': {
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      }
      default: {
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      }
    }
  };

  if (isLoading) {
    return (
      <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
        <div className="soft-shadow border-border bg-card text-card-foreground w-full max-w-4xl space-y-6 rounded-2xl border p-8 shadow-sm">
          <div className="flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin" />
          </div>
          <div className="text-center">
            <h1 className="text-foreground mb-2 text-2xl font-bold">{t('verifyingCertificate')}</h1>
            <p className="text-muted-foreground">{t('loadingCertificate')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || verificationStatus === 'invalid') {
    return (
      <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
        <div className="soft-shadow border-border bg-card text-card-foreground w-full max-w-2xl space-y-6 rounded-2xl border p-8 shadow-sm">
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-destructive/10 rounded-full p-4">
              <XCircle className="text-destructive h-16 w-16" />
            </div>
            <h1 className="text-foreground text-center text-3xl font-bold">{t('certificateNotFound')}</h1>
            <p className="text-muted-foreground text-center">{t('verificationFailed')}</p>
            <span className="bg-muted text-foreground rounded px-2 py-1 font-mono">{certificateUuid}</span>
            <div className="border-destructive/20 bg-destructive/10 w-full rounded-lg border p-4">
              <p className="text-destructive text-sm">{t('verificationFailedReasons')}</p>
              <ul className="text-destructive mt-2 list-inside list-disc space-y-1 text-sm">
                <li>{t('incorrectId')}</li>
                <li>{t('revokedCertificate')}</li>
                <li>{t('expiredCertificate')}</li>
                <li>{t('differentOrganization')}</li>
              </ul>
            </div>
            <div className="pt-4">
              <Link
                href="/"
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-6 py-3 transition duration-200"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>{t('backToHome')}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!certificateData) {
    return null;
  }

  const qrCodeLink = getAbsoluteUrl(`/certificates/${certificateData.certificate_user.user_certification_uuid}/verify`);

  return (
    <div className="bg-background text-foreground min-h-screen py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="soft-shadow border-border bg-card text-card-foreground mb-8 rounded-2xl border p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 rounded-full p-3">
                <Shield className="text-primary h-8 w-8" />
              </div>
              <div>
                <h1 className="text-foreground text-2xl font-bold">{t('certificateInformation')}</h1>
                <p className="text-muted-foreground">{t('authenticityGuaranteed')}</p>
              </div>
            </div>

            <div
              className={`flex items-center space-x-3 rounded-full border px-4 py-2 ${getVerificationStatusColor()}`}
            >
              {getVerificationStatusIcon()}
              <span className="font-semibold">{getVerificationStatusText()}</span>
            </div>
          </div>
        </div>

        {/* Certificate Details */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Certificate Preview and Course Info */}
          <div className="space-y-6 lg:col-span-2">
            {/* Certificate Preview */}
            <div className="soft-shadow border-border bg-card text-card-foreground rounded-2xl border p-6 shadow-sm">
              <h2 className="text-foreground mb-4 text-xl font-semibold">{t('certificatePreview')}</h2>
              <div
                className="mx-auto max-w-2xl"
                id="certificate-preview"
              >
                <CertificatePreview
                  certificationName={certificateData.certification.config.certification_name}
                  certificationDescription={certificateData.certification.config.certification_description}
                  certificationType={certificateData.certification.config.certification_type}
                  certificatePattern={certificateData.certification.config.certificate_pattern}
                  certificateInstructor={certificateData.certification.config.certificate_instructor}
                  certificateId={certificateData.certificate_user.user_certification_uuid}
                  awardedDate={new Date(certificateData.certificate_user.created_at).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                  qrCodeLink={qrCodeLink}
                />
              </div>
            </div>

            {/* Course Information */}
            <div className="border-border bg-card overflow-hidden rounded-lg border p-4 shadow-sm">
              <div className="flex items-start gap-4">
                {/* Course Thumbnail */}
                <div className="shrink-0">
                  <div className="bg-muted ring-border h-12 w-20 overflow-hidden rounded-lg ring-1 ring-inset">
                    {certificateData.course.thumbnail_image ? (
                      <img
                        src={getCourseThumbnailMediaDirectory(
                          certificateData.course.course_uuid,
                          certificateData.course.thumbnail_image,
                        )}
                        alt={`${certificateData.course.name} ${t('courseThumbnailAlt')}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="bg-muted flex h-full w-full items-center justify-center">
                        <svg
                          className="text-muted-foreground h-6 w-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Course Details */}
                <div className="min-w-0 flex-1">
                  <div className="space-y-1">
                    <div>
                      <h4 className="text-foreground text-base leading-tight font-semibold">
                        {certificateData.course.name}
                      </h4>
                      {certificateData.course.description ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                          {certificateData.course.description}
                        </p>
                      ) : null}
                    </div>

                    {certificateData.course.authors && certificateData.course.authors.length > 0 ? (
                      <div className="text-muted-foreground flex items-center gap-1 text-sm font-normal">
                        <span>{t('byLabel')}</span>
                        <div className="flex items-center gap-1">
                          {certificateData.course.authors
                            .filter((author: any) => author.authorship_status === 'ACTIVE')
                            .slice(0, 2)
                            .map((author: any, index: number) => (
                              <span
                                key={author.user.user_uuid}
                                className="text-foreground"
                              >
                                {[author.user.first_name, author.user.middle_name, author.user.last_name]
                                  .filter(Boolean)
                                  .join(' ')}
                                {index <
                                  Math.min(
                                    2,
                                    certificateData.course.authors.filter((a: any) => a.authorship_status === 'ACTIVE')
                                      .length - 1,
                                  ) && ', '}
                              </span>
                            ))}
                          {certificateData.course.authors.filter((author: any) => author.authorship_status === 'ACTIVE')
                            .length > 2 && (
                            <span className="text-muted-foreground">
                              +
                              {certificateData.course.authors.filter(
                                (author: any) => author.authorship_status === 'ACTIVE',
                              ).length - 2}{' '}
                              {t('moreAuthors')}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* View Course Link */}
                <div className="shrink-0">
                  <Link
                    href={getAbsoluteUrl(`/course/${certificateData.course.course_uuid.replace('course_', '')}`)}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
                  >
                    <span>{t('viewCourse')}</span>
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Certificate Details */}
          <div className="space-y-6">
            <div className="soft-shadow border-border bg-card text-card-foreground rounded-2xl border p-6 shadow-sm">
              <h2 className="text-foreground mb-4 text-xl font-semibold">{t('certificationDetails')}</h2>

              <div className="space-y-4">
                <div>
                  <Label className="text-foreground mb-1 block text-sm font-medium">{t('certificateId')}</Label>
                  <div className="bg-muted rounded-lg p-3">
                    <code className="text-foreground text-sm break-all">
                      {certificateData.certificate_user.user_certification_uuid}
                    </code>
                  </div>
                </div>

                <div>
                  <Label className="text-foreground mb-1 block text-sm font-medium">{t('courseName')}</Label>
                  <div className="bg-muted rounded-lg p-3">
                    <span className="text-foreground">{certificateData.course.name}</span>
                  </div>
                </div>

                <div>
                  <Label className="text-foreground mb-1 block text-sm font-medium">{t('certificateType')}</Label>
                  <div className="bg-muted rounded-lg p-3">
                    <span className="text-foreground">
                      {getCertificationTypeLabel(certificateData.certification.config.certification_type)}
                    </span>
                  </div>
                </div>

                <div>
                  <Label className="text-foreground mb-1 block text-sm font-medium">{t('completionDate')}</Label>
                  <div className="bg-muted rounded-lg p-3">
                    <span className="text-foreground">
                      {new Date(certificateData.certificate_user.created_at).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {certificateData.certification.config.certificate_instructor ? (
                  <div>
                    <Label className="text-foreground mb-1 block text-sm font-medium">{t('instructor')}</Label>
                    <div className="bg-muted rounded-lg p-3">
                      <span className="text-foreground">
                        {certificateData.certification.config.certificate_instructor}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-primary/20 bg-primary/5 rounded-2xl border p-6">
              <div className="mb-3 flex items-center gap-3">
                <Shield className="text-primary h-6 w-6" />
                <h3 className="text-foreground text-lg font-semibold">{t('verificationNote')}</h3>
              </div>
              <ul className="text-muted-foreground space-y-2 text-sm">
                <li>• {t('authenticityVerified')}</li>
                <li>• {t('scanQRCode')}</li>
                <li>• {t('cryptographicallySecure')}</li>
                <li>• {t('timestampVerified')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-6 py-3 transition duration-200"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>{t('backToHome')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CertificateVerificationPage;
