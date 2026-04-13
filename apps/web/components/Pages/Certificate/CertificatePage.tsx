'use client';

import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications';
import SimpleAlertDialog from '@/components/ui/alert-dialog-simple';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import Link from '@components/ui/AppLink';
import type React from 'react';
import QRCode from 'qrcode';

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

  // Certificate type translation helper
  const getCertificationTypeLabel = (type: string): string => {
    const typeKey = type as keyof typeof t;
    return t(typeKey) || t('completion');
  };

  // Generate PDF using @react-pdf/renderer
  const downloadCertificate = async () => {
    if (!userCertificate) return;

    try {
      const { Document, Font, Image, Page, StyleSheet, Text, View, pdf } = await import('@react-pdf/renderer');

      // Register font for Cyrillic/Russian support
      Font.register({
        family: 'Roboto',
        fonts: [
          {
            src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf',
            fontWeight: 400,
          },
          {
            src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf',
            fontWeight: 700,
          },
          {
            src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9vAx05IsDqlA.ttf',
            fontWeight: 600,
          },
        ],
      });

      // Get theme colors based on pattern
      const getPatternTheme = (pattern: string) => {
        switch (pattern) {
          case 'royal': {
            return {
              primary: '#b45309',
              secondary: '#d97706',
              icon: '#d97706',
              iconLight: 'rgba(217, 119, 6, 0.2)',
              iconMedium: 'rgba(217, 119, 6, 0.4)',
              iconBorder: 'rgba(217, 119, 6, 0.2)',
            };
          }
          case 'tech': {
            return {
              primary: '#0e7490',
              secondary: '#0891b2',
              icon: '#0891b2',
              iconLight: 'rgba(8, 145, 178, 0.2)',
              iconMedium: 'rgba(8, 145, 178, 0.4)',
              iconBorder: 'rgba(8, 145, 178, 0.2)',
            };
          }
          case 'nature': {
            return {
              primary: '#15803d',
              secondary: '#16a34a',
              icon: '#16a34a',
              iconLight: 'rgba(22, 163, 74, 0.2)',
              iconMedium: 'rgba(22, 163, 74, 0.4)',
              iconBorder: 'rgba(22, 163, 74, 0.2)',
            };
          }
          case 'geometric': {
            return {
              primary: '#7c3aed',
              secondary: '#9333ea',
              icon: '#9333ea',
              iconLight: 'rgba(147, 51, 234, 0.2)',
              iconMedium: 'rgba(147, 51, 234, 0.4)',
              iconBorder: 'rgba(147, 51, 234, 0.2)',
            };
          }
          case 'vintage': {
            return {
              primary: '#c2410c',
              secondary: '#ea580c',
              icon: '#ea580c',
              iconLight: 'rgba(234, 88, 12, 0.2)',
              iconMedium: 'rgba(234, 88, 12, 0.4)',
              iconBorder: 'rgba(234, 88, 12, 0.2)',
            };
          }
          case 'waves': {
            return {
              primary: '#1d4ed8',
              secondary: '#2563eb',
              icon: '#2563eb',
              iconLight: 'rgba(37, 99, 235, 0.2)',
              iconMedium: 'rgba(37, 99, 235, 0.4)',
              iconBorder: 'rgba(37, 99, 235, 0.2)',
            };
          }
          case 'minimal': {
            return {
              primary: '#374151',
              secondary: '#4b5563',
              icon: '#4b5563',
              iconLight: 'rgba(75, 85, 99, 0.2)',
              iconMedium: 'rgba(75, 85, 99, 0.4)',
              iconBorder: 'rgba(75, 85, 99, 0.2)',
            };
          }
          case 'professional': {
            return {
              primary: '#334155',
              secondary: '#475569',
              icon: '#475569',
              iconLight: 'rgba(71, 85, 105, 0.2)',
              iconMedium: 'rgba(71, 85, 105, 0.4)',
              iconBorder: 'rgba(71, 85, 105, 0.2)',
            };
          }
          case 'academic': {
            return {
              primary: '#3730a3',
              secondary: '#4338ca',
              icon: '#4338ca',
              iconLight: 'rgba(67, 56, 202, 0.2)',
              iconMedium: 'rgba(67, 56, 202, 0.4)',
              iconBorder: 'rgba(67, 56, 202, 0.2)',
            };
          }
          case 'modern': {
            return {
              primary: '#1d4ed8',
              secondary: '#2563eb',
              icon: '#2563eb',
              iconLight: 'rgba(37, 99, 235, 0.2)',
              iconMedium: 'rgba(37, 99, 235, 0.4)',
              iconBorder: 'rgba(37, 99, 235, 0.2)',
            };
          }
          default: {
            return {
              primary: '#374151',
              secondary: '#4b5563',
              icon: '#4b5563',
              iconLight: 'rgba(75, 85, 99, 0.2)',
              iconMedium: 'rgba(75, 85, 99, 0.4)',
              iconBorder: 'rgba(75, 85, 99, 0.2)',
            };
          }
        }
      };

      const theme = getPatternTheme(userCertificate.certification.config.certificate_pattern);
      const certificateUUID = userCertificate.certificate_user.user_certification_uuid;
      const qrCodeData = qrCodeLink;

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData, {
        width: 240,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
        type: 'image/png',
      });

      // PDF styles - Modern and Beautiful Layout
      const styles = StyleSheet.create({
        page: {
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          padding: 0,
          position: 'relative',
          fontFamily: 'Roboto',
        },
        // Decorative corner accents
        cornerTopLeft: {
          position: 'absolute',
          top: 30,
          left: 30,
          width: 80,
          height: 80,
          borderLeft: `3px solid ${theme.secondary}`,
          borderTop: `3px solid ${theme.secondary}`,
        },
        cornerTopRight: {
          position: 'absolute',
          top: 30,
          right: 30,
          width: 80,
          height: 80,
          borderRight: `3px solid ${theme.secondary}`,
          borderTop: `3px solid ${theme.secondary}`,
        },
        cornerBottomLeft: {
          position: 'absolute',
          bottom: 30,
          left: 30,
          width: 80,
          height: 80,
          borderLeft: `3px solid ${theme.secondary}`,
          borderBottom: `3px solid ${theme.secondary}`,
        },
        cornerBottomRight: {
          position: 'absolute',
          bottom: 30,
          right: 30,
          width: 80,
          height: 80,
          borderRight: `3px solid ${theme.secondary}`,
          borderBottom: `3px solid ${theme.secondary}`,
        },
        // Main content container
        contentWrapper: {
          padding: '30px 60px 20px',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100%',
        },
        // Top section with ID and QR
        topSection: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          width: '100%',
          marginBottom: 15,
        },
        idContainer: {
          flexDirection: 'column',
        },
        idLabel: {
          fontSize: 8,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
          fontFamily: 'Roboto',
        },
        idText: {
          fontSize: 10,
          color: theme.secondary,
          fontWeight: 600,
          fontFamily: 'Roboto',
        },
        qrWrapper: {
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        },
        qrContainer: {
          width: 80,
          height: 80,
          padding: 6,
          border: `2px solid ${theme.secondary}`,
          borderRadius: 8,
          backgroundColor: '#ffffff',
        },
        qrImage: {
          width: '100%',
          height: '100%',
        },
        qrLabel: {
          fontSize: 7,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontFamily: 'Roboto',
        },
        // Header with decorative lines
        headerSection: {
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 12,
          width: '100%',
        },
        headerDeco: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        },
        headerLine: {
          width: 60,
          height: 2,
          backgroundColor: theme.secondary,
        },
        headerDiamond: {
          width: 8,
          height: 8,
          backgroundColor: theme.primary,
          transform: 'rotate(45deg)',
        },
        headerText: {
          fontSize: 14,
          color: theme.secondary,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 3,
          fontFamily: 'Roboto',
        },
        // Icon and badge section
        iconBadgeSection: {
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 10,
        },
        iconContainer: {
          width: 60,
          height: 60,
          backgroundColor: theme.iconLight,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
          border: `2px solid ${theme.iconBorder}`,
        },
        icon: {
          fontSize: 30,
          fontFamily: 'Roboto',
        },
        badge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 24,
          paddingVertical: 10,
          backgroundColor: theme.iconLight,
          borderRadius: 20,
          border: `2px solid ${theme.secondary}`,
        },
        badgeCheck: {
          fontSize: 16,
          color: theme.primary,
          fontWeight: 'bold',
          fontFamily: 'Roboto',
        },
        badgeText: {
          fontSize: 12,
          color: theme.primary,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontFamily: 'Roboto',
        },
        // Title and description
        titleSection: {
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 10,
          width: '100%',
        },
        title: {
          fontSize: 24,
          fontWeight: 'bold',
          color: theme.primary,
          marginBottom: 10,
          textAlign: 'center',
          lineHeight: 1.2,
          maxWidth: '80%',
          fontFamily: 'Roboto',
        },
        description: {
          fontSize: 10,
          color: '#6b7280',
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: '70%',
          fontFamily: 'Roboto',
        },
        // Decorative divider
        dividerSection: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginVertical: 10,
        },
        dividerLine: {
          width: 40,
          height: 2,
          backgroundColor: theme.secondary,
          opacity: 0.4,
        },
        dividerCircle: {
          width: 6,
          height: 6,
          backgroundColor: theme.primary,
          borderRadius: 3,
          opacity: 0.7,
        },
        // Information box
        infoSection: {
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          marginTop: 5,
        },
        infoBox: {
          padding: 12,
          backgroundColor: '#fafbfc',
          borderRadius: 6,
          border: `1px solid ${theme.iconBorder}`,
          width: '65%',
        },
        infoRow: {
          flexDirection: 'row',
          marginVertical: 4,
          alignItems: 'flex-start',
        },
        infoLabel: {
          fontSize: 11,
          fontWeight: 'bold',
          color: theme.primary,
          width: 120,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontFamily: 'Roboto',
        },
        infoValue: {
          fontSize: 11,
          color: '#374151',
          flex: 1,
          lineHeight: 1.4,
          fontFamily: 'Roboto',
        },
        // Footer
        footerSection: {
          position: 'absolute',
          bottom: 20,
          left: 0,
          right: 0,
          flexDirection: 'column',
          alignItems: 'center',
        },
        footerLine: {
          width: 120,
          height: 1,
          backgroundColor: theme.secondary,
          opacity: 0.3,
          marginBottom: 6,
        },
        footer: {
          fontSize: 7,
          color: '#9ca3af',
          textAlign: 'center',
          maxWidth: '70%',
          lineHeight: 1.3,
          fontFamily: 'Roboto',
        },
      });

      // Create PDF Document with Modern Layout
      const CertificateDocument = (
        <Document>
          <Page
            size="A4"
            orientation="landscape"
            style={styles.page}
          >
            {/* Decorative corner borders */}
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />

            {/* Main content wrapper */}
            <View style={styles.contentWrapper}>
              {/* Top section with ID and QR code */}
              <View style={styles.topSection}>
                <View style={styles.idContainer}>
                  <Text style={styles.idLabel}>{t('certificateId')}</Text>
                  <Text style={styles.idText}>{certificateUUID}</Text>
                </View>
                <View style={styles.qrWrapper}>
                  <View style={styles.qrContainer}>
                    <Image
                      src={qrCodeDataUrl}
                      style={styles.qrImage}
                    />
                  </View>
                  <Text style={styles.qrLabel}>{t('authenticityGuaranteed')}</Text>
                </View>
              </View>

              {/* Header section */}
              <View style={styles.headerSection}>
                <View style={styles.headerDeco}>
                  <View style={styles.headerLine} />
                  <View style={styles.headerDiamond} />
                  <View style={styles.headerLine} />
                </View>
                <Text style={styles.headerText}>{t('certificate')}</Text>
              </View>

              {/* Icon and badge */}
              <View style={styles.iconBadgeSection}>
                <View style={styles.badge}>
                  <Text style={styles.badgeCheck}>✓</Text>
                  <Text style={styles.badgeText}>
                    {getCertificationTypeLabel(userCertificate.certification.config.certification_type)}
                  </Text>
                </View>
              </View>

              {/* Title and description */}
              <View style={styles.titleSection}>
                <Text style={styles.title}>{userCertificate.certification.config.certification_name}</Text>
                <Text style={styles.description}>
                  {userCertificate.certification.config.certification_description ||
                    t('certificationDefaultDescription')}
                </Text>
              </View>

              {/* Decorative divider */}
              <View style={styles.dividerSection}>
                <View style={styles.dividerLine} />
                <View style={styles.dividerCircle} />
                <View style={styles.dividerLine} />
                <View style={styles.dividerCircle} />
                <View style={styles.dividerLine} />
              </View>

              {/* Information box */}
              <View style={styles.infoSection}>
                <View style={styles.infoBox}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('awarded')}</Text>
                    <Text style={styles.infoValue}>
                      {new Date(userCertificate.certificate_user.created_at).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  {userCertificate.certification.config.certificate_instructor && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('instructor')}</Text>
                      <Text style={styles.infoValue}>
                        {userCertificate.certification.config.certificate_instructor}
                      </Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('certificateId')}</Text>
                    <Text style={styles.infoValue}>{certificateUUID}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footerSection}>
              <View style={styles.footerLine} />
              <Text style={styles.footer}>
                {`${t('verificationNote')}:`} {qrCodeData.replace('https://', '').replace('http://', '')}
              </Text>
            </View>
          </Page>
        </Document>
      );

      // Generate and download PDF
      const blob = await pdf(CertificateDocument).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${userCertificate.certification.config.certification_name.replaceAll(/[^\dA-Za-z]/g, '_')}_${t('certificateFileName')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
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
