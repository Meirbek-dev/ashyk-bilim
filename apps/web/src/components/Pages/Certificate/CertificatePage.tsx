'use client';

import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications';
import {
  downloadPdfBlob,
  generateCertificatePdfBlob,
  sanitizePdfFileName,
} from '@/features/certifications/utils/pdfmeCertificate';
import SimpleAlertDialog from '@/components/ui/alert-dialog-simple';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import Link from '@components/ui/AppLink';
import type React from 'react';

interface CertificatePageProps {
  courseid: string;
  qrCodeLink: string;
}

const CertificatePage: React.FC<CertificatePageProps> = ({ courseid, qrCodeLink }) => {
  const locale = useLocale();
  const t = useTranslations('Certificates.CertificatePage');
  const [dialogAlertOpen, setDialogAlertOpen] = useState(false);
  const [dialogAlertMessage, setDialogAlertMessage] = useState('');
  const normalizedCourseId = courseid.startsWith('course_') ? courseid : `course_${courseid}`;
  const certificateQuery = useUserCertificateByCourse(normalizedCourseId);
  const userCertificate = certificateQuery.data?.data?.[0] ?? null;
  const isLoading = certificateQuery.isPending;
  const certificateError = certificateQuery.error
    ? t('error')
    : !isLoading && !userCertificate
      ? t('noCertificate')
      : null;

  const getCertificationTypeLabel = (type: string): string => {
    switch (type) {
      case 'completion': {
        return t('completion');
      }
      default: {
        return t('completion');
      }
    }
  };

  const downloadCertificate = async () => {
    if (!userCertificate) return;

    try {
      const certificateId = userCertificate.certificate_user.user_certification_uuid;
      const certificationName = userCertificate.certification.config.certification_name;
      const blob = await generateCertificatePdfBlob({
        awardedDate: new Date(userCertificate.certificate_user.created_at).toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        certificateId,
        certificationDescription:
          userCertificate.certification.config.certification_description || t('certificationDefaultDescription'),
        certificationName,
        certificationTypeLabel: getCertificationTypeLabel(userCertificate.certification.config.certification_type),
        instructor: userCertificate.certification.config.certificate_instructor,
        labels: {
          authenticityGuaranteed: t('verifyOnline'),
          awarded: t('awarded'),
          badgeCheckIcon: t('badgeCheckIcon'),
          certificate: t('certificate'),
          certificateId: t('certificateId'),
          instructor: t('instructor'),
          verificationNote: t('verificationNote'),
        },
        pattern: userCertificate.certification.config.certificate_pattern,
        verificationUrl: qrCodeLink,
      });

      downloadPdfBlob(blob, `${sanitizePdfFileName(certificationName)}_${t('certificateFileName')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setDialogAlertMessage(t('errorGeneratingPDF'));
      setDialogAlertOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="border-border bg-card rounded-full border p-6 shadow-lg">
            <Loader2
              size={32}
              className="text-primary animate-spin"
            />
          </div>
          <span className="text-foreground text-lg font-medium">{t('loading')}</span>
        </div>
      </div>
    );
  }

  if (certificateError) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="mx-auto max-w-md p-6 text-center">
          <div className="border-destructive/20 bg-card rounded-2xl border p-8 shadow-xl">
            <div className="bg-destructive/10 text-destructive mb-4 inline-flex rounded-full p-4">
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-foreground mb-3 text-2xl font-bold">{t('errorNonAvailable')}</h2>
            <p className="text-muted-foreground mb-6 text-base">{certificateError}</p>
            <Link
              href={`${getAbsoluteUrl('')}/course/${courseid}`}
              className="bg-primary text-primary-foreground inline-flex items-center space-x-2 rounded-xl px-8 py-3.5 font-medium shadow-lg transition-all duration-200 hover:scale-105 hover:opacity-90"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>{t('backToHome')}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!userCertificate) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="mx-auto max-w-md p-6 text-center">
          <div className="border-border bg-card rounded-2xl border p-8 shadow-xl">
            <div className="bg-muted text-muted-foreground mb-4 inline-flex rounded-full p-4">
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                />
              </svg>
            </div>
            <h2 className="text-foreground mb-3 text-2xl font-bold">{t('noCertificate')}</h2>
            <p className="text-muted-foreground mb-6 text-base">{t('noCertificate')}</p>
            <Link
              href={`${getAbsoluteUrl('')}/course/${courseid}`}
              className="bg-primary text-primary-foreground inline-flex items-center space-x-2 rounded-xl px-8 py-3.5 font-medium shadow-lg transition-all duration-200 hover:scale-105 hover:opacity-90"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>{t('backToHome')}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <SimpleAlertDialog
        open={dialogAlertOpen}
        onOpenChange={setDialogAlertOpen}
        description={dialogAlertMessage}
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`${getAbsoluteUrl('')}/course/${courseid}`}
            className="group inline-flex items-center space-x-2 rounded-lg px-4 py-2 text-gray-600 transition-all duration-200 hover:bg-white hover:text-gray-900 hover:shadow-md"
          >
            <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            <span className="font-medium">{t('backToHome')}</span>
          </Link>

          <div className="flex items-center space-x-4">
            <button
              onClick={downloadCertificate}
              className="inline-flex items-center space-x-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-3.5 font-medium text-white shadow-lg shadow-green-200 transition-all duration-200 hover:scale-105 hover:shadow-xl"
            >
              <Download className="h-5 w-5" />
              <span>{t('downloadPDF')}</span>
            </button>
          </div>
        </div>

        {/* Certificate Display */}
        <div className="group hover:shadow-3xl relative rounded-3xl bg-white p-10 shadow-2xl shadow-gray-200/50 transition-all duration-300">
          {/* Decorative gradient border */}
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 opacity-0 blur transition-opacity group-hover:opacity-100" />

          <div className="mx-auto max-w-3xl">
            <CertificatePreview
              certificationName={userCertificate.certification.config.certification_name}
              certificationDescription={userCertificate.certification.config.certification_description}
              certificationType={userCertificate.certification.config.certification_type}
              certificatePattern={userCertificate.certification.config.certificate_pattern}
              certificateInstructor={userCertificate.certification.config.certificate_instructor}
              certificateId={userCertificate.certificate_user.user_certification_uuid}
              awardedDate={new Date(userCertificate.certificate_user.created_at).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              qrCodeLink={qrCodeLink}
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-10 rounded-2xl border border-gray-200 bg-white/80 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="mb-4 inline-flex rounded-full bg-blue-100 p-3">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700">{t('downloadInstructions')}</p>
            <p className="text-sm text-gray-500">{t('qrCodeInstructions')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificatePage;
