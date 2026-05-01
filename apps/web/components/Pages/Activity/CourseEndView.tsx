import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview';
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications';
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { ArrowLeft, BookOpen, Download, Loader2, Shield, Target, Trophy } from 'lucide-react';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import SimpleAlertDialog from '@/components/ui/alert-dialog-simple';
import { useGamificationStore } from '@/stores/gamification';
import { getAbsoluteUrl } from '@services/config/config';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
// Gamification imports
import { LevelProgress } from '@/lib/gamification';
import NextImage from '@components/ui/NextImage';
import Link from '@components/ui/ServerLink';
import confetti from 'canvas-confetti';
import type { FC } from 'react';
import QRCode from 'qrcode';

interface CourseEndViewProps {
  courseName: string;
  courseUuid: string;
  thumbnailImage: string;
  course: any;
  trailData: any;
}

const CourseEndView: FC<CourseEndViewProps> = ({ courseName, courseUuid, thumbnailImage, course, trailData }) => {
  const locale = useLocale();
  const t = useTranslations('Certificates.CourseEndView');
  const [dialogAlertOpen, setDialogAlertOpen] = useState(false);
  const [dialogAlertMessage, setDialogAlertMessage] = useState('');

  const gamificationProfile = useGamificationStore((s) => s.profile);
  const gamificationRefetch = useGamificationStore((s) => s.refetch);

  const refetchedOnMountRef = useRef(false);
  const refetchedOnCertificateRef = useRef(false);

  // Check if course is actually completed
  const isCourseCompleted = (() => {
    if (!(trailData && course)) return false;

    // Flatten all activities
    const allActivities = course.chapters.flatMap((chapter: any) =>
      chapter.activities.map((activity: any) => ({
        ...activity,
        chapterId: chapter.id,
      })),
    );

    // Check if all activities are completed
    const isActivityDone = (activity: any) => {
      const cleanCourseUuid = course.course_uuid?.replace('course_', '');
      const run = trailData?.runs?.find((run: any) => {
        const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
        return cleanRunCourseUuid === cleanCourseUuid;
      });

      if (run) {
        return run.steps.find((step: any) => step.activity_id === activity.id && step.complete === true);
      }
      return false;
    };

    const totalActivities = allActivities.length;
    const completedActivities = allActivities.filter((activity: any) => isActivityDone(activity)).length;
    return totalActivities > 0 && completedActivities === totalActivities;
  })();
  const normalizedCourseUuid = courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`;
  const certificateQuery = useUserCertificateByCourse(isCourseCompleted ? normalizedCourseUuid : null);
  const userCertificate = certificateQuery.data?.data?.[0] ?? null;
  const isLoadingCertificate = isCourseCompleted && certificateQuery.isPending;
  const certificateError = certificateQuery.error
    ? t('loadingError')
    : !isLoadingCertificate && isCourseCompleted && !userCertificate
      ? t('noCertificateFound')
      : null;
  const qrCodeLink = getAbsoluteUrl(
    `/certificates/${userCertificate?.certificate_user.user_certification_uuid}/verify`,
  );

  useEffect(() => {
    if (!userCertificate || typeof gamificationRefetch !== 'function') return;
    if (refetchedOnCertificateRef.current) return;

    refetchedOnCertificateRef.current = true;
    gamificationRefetch().catch((error: unknown) =>
      console.warn('Failed to refetch gamification after course completion:', error),
    );
  }, [userCertificate, gamificationRefetch]);

  // Refetch gamification data on mount if course is completed
  // This ensures recent activity feed shows course completion XP
  useEffect(() => {
    if (!isCourseCompleted || typeof gamificationRefetch !== 'function') return;

    // Ensure we only trigger this refetch once on mount after completion
    if (refetchedOnMountRef.current) return;
    refetchedOnMountRef.current = true;

    const timer = setTimeout(() => {
      gamificationRefetch().catch((error: unknown) =>
        console.warn('Failed to refetch gamification on CourseEndView mount:', error),
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [isCourseCompleted, gamificationRefetch]);

  useEffect(() => {
    if (!isCourseCompleted) return;

    const colors = ['#6366f1', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#ffffff'];

    // Big opening bursts
    confetti({
      particleCount: 140,
      spread: 100,
      origin: { y: 0.4 },
      scalar: 1.6,
      ticks: 400,
      colors,
    });
    const t1 = setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 80,
        shapes: ['star'],
        scalar: 2.2,
        origin: { y: 0.4 },
        ticks: 350,
        colors,
      });
    }, 200);
    const t2 = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.2, y: 0.5 },
        scalar: 1.5,
        ticks: 300,
        colors,
      });
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.8, y: 0.5 },
        scalar: 1.5,
        ticks: 300,
        colors,
      });
    }, 500);

    // Continuous cannons from both sides for 3 seconds
    const end = Date.now() + 3000;
    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        return;
      }
      confetti({
        particleCount: 7,
        angle: 60,
        spread: 58,
        origin: { x: 0, y: 0.65 },
        scalar: 1.4,
        ticks: 300,
        colors,
      });
      confetti({
        particleCount: 7,
        angle: 120,
        spread: 58,
        origin: { x: 1, y: 0.65 },
        scalar: 1.4,
        ticks: 300,
        colors,
      });
    }, 50);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(interval);
    };
  }, [isCourseCompleted]);

  // Generate PDF using @react-pdf/renderer
  const downloadCertificate = async () => {
    if (!userCertificate) return;

    try {
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

      // Helper function to get localized certification type
      const getCertificationTypeLabel = (type: string) => {
        switch (type) {
          case 'completion': {
            return t('certificationTypes.completion');
          }
          case 'achievement': {
            return t('certificationTypes.achievement');
          }
          case 'assessment': {
            return t('certificationTypes.assessment');
          }
          case 'participation': {
            return t('certificationTypes.participation');
          }
          case 'mastery': {
            return t('certificationTypes.mastery');
          }
          case 'professional': {
            return t('certificationTypes.professional');
          }
          case 'continuing': {
            return t('certificationTypes.continuing');
          }
          case 'workshop': {
            return t('certificationTypes.workshop');
          }
          case 'specialization': {
            return t('certificationTypes.specialization');
          }
          default: {
            return t('certificationTypes.completion');
          }
        }
      };

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
      const certificateId = userCertificate.certificate_user.user_certification_uuid;
      const qrCodeData = qrCodeLink;

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData, {
        width: 240,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
        type: 'image/png',
      });

      const styles = StyleSheet.create({
        page: {
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          padding: 0,
          position: 'relative',
          fontFamily: 'Roboto',
        },
        cornerTopLeft: {
          position: 'absolute',
          top: 24,
          left: 24,
          width: 100,
          height: 100,
          borderLeft: `4px solid ${theme.secondary}`,
          borderTop: `4px solid ${theme.secondary}`,
          opacity: 0.9,
        },
        cornerTopRight: {
          position: 'absolute',
          top: 24,
          right: 24,
          width: 100,
          height: 100,
          borderRight: `4px solid ${theme.secondary}`,
          borderTop: `4px solid ${theme.secondary}`,
          opacity: 0.9,
        },
        cornerBottomLeft: {
          position: 'absolute',
          bottom: 24,
          left: 24,
          width: 100,
          height: 100,
          borderLeft: `4px solid ${theme.secondary}`,
          borderBottom: `4px solid ${theme.secondary}`,
          opacity: 0.9,
        },
        cornerBottomRight: {
          position: 'absolute',
          bottom: 24,
          right: 24,
          width: 100,
          height: 100,
          borderRight: `4px solid ${theme.secondary}`,
          borderBottom: `4px solid ${theme.secondary}`,
          opacity: 0.9,
        },
        // Main content container with better spacing
        contentWrapper: {
          padding: '40px 70px 30px',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100%',
        },
        // Top section with ID and QR - improved layout
        topSection: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          width: '100%',
          marginBottom: 20,
        },
        idContainer: {
          flexDirection: 'column',
          backgroundColor: '#f9fafb',
          padding: 10,
          borderRadius: 6,
          borderLeft: `3px solid ${theme.secondary}`,
        },
        idLabel: {
          fontSize: 9,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginBottom: 5,
          fontFamily: 'Roboto',
          fontWeight: 600,
        },
        idText: {
          fontSize: 11,
          color: theme.primary,
          fontWeight: 700,
          fontFamily: 'Roboto',
          letterSpacing: 0.3,
        },
        qrWrapper: {
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        },
        qrContainer: {
          width: 90,
          height: 90,
          padding: 8,
          border: `3px solid ${theme.secondary}`,
          borderRadius: 10,
          backgroundColor: '#ffffff',
          boxShadow: `0 2px 8px ${theme.iconLight}`,
        },
        qrImage: {
          width: '100%',
          height: '100%',
        },
        qrLabel: {
          fontSize: 8,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          fontFamily: 'Roboto',
          fontWeight: 600,
        },
        headerSection: {
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 18,
          width: '100%',
        },
        headerDeco: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          marginBottom: 14,
        },
        headerLine: {
          width: 80,
          height: 2.5,
          backgroundColor: theme.secondary,
          opacity: 0.8,
        },
        headerDiamond: {
          width: 10,
          height: 10,
          backgroundColor: theme.primary,
          transform: 'rotate(45deg)',
          border: `1px solid ${theme.secondary}`,
        },
        headerText: {
          fontSize: 16,
          color: theme.primary,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 4,
          fontFamily: 'Roboto',
        },
        // Icon and badge section with better visual hierarchy
        iconBadgeSection: {
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 16,
        },
        iconContainer: {
          width: 70,
          height: 70,
          backgroundColor: theme.iconLight,
          borderRadius: 35,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
          border: `3px solid ${theme.secondary}`,
          boxShadow: `0 4px 12px ${theme.iconMedium}`,
        },
        icon: {
          fontSize: 34,
          fontFamily: 'Roboto',
        },
        badge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 28,
          paddingVertical: 12,
          backgroundColor: theme.iconLight,
          borderRadius: 24,
          border: `3px solid ${theme.secondary}`,
          boxShadow: `0 2px 8px ${theme.iconMedium}`,
        },
        badgeCheck: {
          fontSize: 18,
          color: theme.primary,
          fontWeight: 'bold',
          fontFamily: 'Roboto',
        },
        badgeText: {
          fontSize: 13,
          color: theme.primary,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          fontFamily: 'Roboto',
        },
        // Title and description with improved typography
        titleSection: {
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 14,
          width: '100%',
        },
        title: {
          fontSize: 28,
          fontWeight: 'bold',
          color: theme.primary,
          marginBottom: 12,
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: '85%',
          fontFamily: 'Roboto',
          letterSpacing: 0.5,
        },
        description: {
          fontSize: 11,
          color: '#4b5563',
          textAlign: 'center',
          lineHeight: 1.5,
          maxWidth: '75%',
          fontFamily: 'Roboto',
        },
        dividerSection: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginVertical: 14,
        },
        dividerLine: {
          width: 50,
          height: 2,
          backgroundColor: theme.secondary,
          opacity: 0.5,
        },
        dividerCircle: {
          width: 7,
          height: 7,
          backgroundColor: theme.primary,
          borderRadius: 3.5,
          opacity: 0.8,
          border: `1px solid ${theme.secondary}`,
        },
        infoSection: {
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          marginTop: 8,
        },
        infoBox: {
          padding: 16,
          backgroundColor: '#f9fafb',
          borderRadius: 8,
          border: `2px solid ${theme.iconBorder}`,
          width: '70%',
          boxShadow: `0 1px 4px ${theme.iconLight}`,
        },
        infoRow: {
          flexDirection: 'row',
          marginVertical: 5,
          alignItems: 'flex-start',
        },
        infoLabel: {
          fontSize: 11,
          fontWeight: 700,
          color: theme.primary,
          width: 130,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          fontFamily: 'Roboto',
        },
        infoValue: {
          fontSize: 11,
          color: '#1f2937',
          flex: 1,
          lineHeight: 1.5,
          fontFamily: 'Roboto',
          fontWeight: 400,
        },
        footerSection: {
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          flexDirection: 'column',
          alignItems: 'center',
        },
        footerLine: {
          width: 140,
          height: 1.5,
          backgroundColor: theme.secondary,
          opacity: 0.4,
          marginBottom: 8,
        },
        footer: {
          fontSize: 8,
          color: '#6b7280',
          textAlign: 'center',
          maxWidth: '75%',
          lineHeight: 1.4,
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
                  <Text style={styles.idText}>{certificateId}</Text>
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
                    t('defaultCertificationDescription')}
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
                    <Text style={styles.infoLabel}>{t('labelAwarded')}</Text>
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
                    <Text style={styles.infoValue}>{certificateId}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footerSection}>
              <View style={styles.footerLine} />
              <Text style={styles.footer}>
                {`${t('certificateCanBeVerified')}:`} {qrCodeLink.replace('https://', '').replace('http://', '')}
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
      link.download = `${userCertificate.certification.config.certification_name.replaceAll(/[^\dA-Za-z]/g, '_')}_Certificate.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setDialogAlertMessage(t('errorGeneratingPDF'));
      setDialogAlertOpen(true);
    }
  };

  // Calculate progress for incomplete courses
  const progressInfo = (() => {
    if (!(trailData && course) || isCourseCompleted) return null;

    const allActivities = course.chapters.flatMap((chapter: any) =>
      chapter.activities.map((activity: any) => ({
        ...activity,
        chapterId: chapter.id,
      })),
    );

    const isActivityDone = (activity: any) => {
      const cleanCourseUuid = course.course_uuid?.replace('course_', '');
      const run = trailData?.runs?.find((run: any) => {
        const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
        return cleanRunCourseUuid === cleanCourseUuid;
      });

      if (run) {
        return run.steps.find((step: any) => step.activity_id === activity.id && step.complete === true);
      }
      return false;
    };

    const totalActivities = allActivities.length;
    const completedActivities = allActivities.filter((activity: any) => isActivityDone(activity)).length;
    const progressPercentage = Math.round((completedActivities / totalActivities) * 100);

    return {
      completed: completedActivities,
      total: totalActivities,
      percentage: progressPercentage,
    };
  })();

  if (isCourseCompleted) {
    // Show congratulations for completed course
    return (
      <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <SimpleAlertDialog
          open={dialogAlertOpen}
          onOpenChange={setDialogAlertOpen}
          description={dialogAlertMessage}
        />
        <div className="soft-shadow relative z-10 mb-2 w-full space-y-6 rounded-2xl bg-white p-8">
          <div className="flex flex-col items-center space-y-6">
            {thumbnailImage ? (
              <div className="relative h-[114px] w-[200px] overflow-hidden rounded-lg shadow-md">
                <NextImage
                  src={getCourseThumbnailMediaDirectory(courseUuid, thumbnailImage)}
                  alt={courseName}
                  fill
                  className="object-cover"
                  sizes="100vw"
                />
              </div>
            ) : null}

            <div className="rounded-full bg-emerald-100 p-4">
              <Trophy className="h-16 w-16 text-emerald-600" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-gray-900">{`${t('congratulations')} 🎉`}</h1>

          <p className="text-xl text-gray-600">
            {t('courseCompleted')}
            <span className="font-semibold text-gray-900"> {courseName}</span>
          </p>

          <p className="text-gray-500">{t('completionDescription')}</p>

          {/* Gamification Celebration */}
          {gamificationProfile && (
            <div className="space-y-4 rounded-lg border border-yellow-200 bg-linear-to-br from-yellow-50 to-orange-50 p-6">
              <div className="flex items-center justify-center space-x-2">
                <Trophy className="h-6 w-6 text-yellow-600" />
                <h3 className="text-xl font-semibold text-gray-900">{t('learningAchievementUnlocked')}</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-center">
                    {gamificationProfile && (
                      <LevelProgress
                        profile={gamificationProfile}
                        showMilestones={false}
                        className="justify-center"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-center space-x-2 text-green-600">
                    <Target className="h-5 w-5" />
                    <span className="font-semibold">{t('xpBonusMessage')}</span>
                  </div>
                  <div className="text-center text-sm text-gray-600">{t('keepLearningMessage')}</div>
                </div>
              </div>
            </div>
          )}

          {/* Certificate Display */}
          {isLoadingCertificate ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-3 text-gray-600">{t('loadingCertificate')}</span>
            </div>
          ) : certificateError ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
              <p className="text-yellow-800">{certificateError}</p>
            </div>
          ) : userCertificate ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">{t('earnedCertificate')}</h2>
              <div
                className="mx-auto max-w-2xl"
                id="certificate-preview"
              >
                <div id="certificate-content">
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
              <div className="flex justify-center space-x-4">
                <button
                  onClick={downloadCertificate}
                  className="inline-flex items-center space-x-2 rounded-full bg-green-600 px-6 py-3 text-white transition duration-200 hover:bg-green-700"
                >
                  <Download className="h-5 w-5" />
                  <span>{t('downloadCertificate')}</span>
                </button>
                <Link
                  prefetch={false}
                  href={getAbsoluteUrl(
                    `/certificates/${userCertificate.certificate_user.user_certification_uuid}/verify`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 rounded-full bg-blue-600 px-6 py-3 text-white transition duration-200 hover:bg-blue-700"
                >
                  <Shield className="h-5 w-5" />
                  <span>{t('verifyCertificate')}</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-6">
              <p className="text-gray-600">{t('noCertificateAvailable')}</p>
            </div>
          )}

          <div className="pt-6">
            <Link
              prefetch={false}
              href={getAbsoluteUrl(`/course/${courseUuid.replace('course_', '')}`)}
              className="inline-flex items-center space-x-2 rounded-full bg-gray-800 px-6 py-3 text-white transition duration-200 hover:bg-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>{t('backToCourse')}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }
  // Show progress and encouragement for incomplete course
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <SimpleAlertDialog
        open={dialogAlertOpen}
        onOpenChange={setDialogAlertOpen}
        description={dialogAlertMessage}
      />
      <div className="soft-shadow w-full max-w-2xl space-y-6 rounded-2xl bg-white p-8">
        <div className="flex flex-col items-center space-y-6">
          {thumbnailImage ? (
            <div className="relative h-[114px] w-[200px] overflow-hidden rounded-lg shadow-md">
              <NextImage
                src={getCourseThumbnailMediaDirectory(courseUuid, thumbnailImage)}
                alt={courseName}
                fill
                className="object-cover"
                sizes="100vw"
              />
            </div>
          ) : null}

          <div className="rounded-full bg-blue-100 p-4">
            <Target className="h-16 w-16 text-blue-600" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-gray-900">{`${t('keepGoing')} 💪`}</h1>

        <p className="text-xl text-gray-600">
          {t('youAreMakingProgress')}
          <span className="font-semibold text-gray-900"> {courseName}</span>
        </p>

        {progressInfo ? (
          <div className="space-y-4 rounded-lg bg-gray-50 p-6">
            <div className="flex items-center justify-center space-x-2">
              <BookOpen className="h-5 w-5 text-gray-600" />
              <span className="text-lg font-semibold text-gray-700">{t('courseProgress')}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">{t('progress')}</span>
                <span className="font-semibold text-gray-900">{`${progressInfo.percentage}%`}</span>
              </div>

              <div className="h-3 w-full rounded-full bg-gray-200">
                <div
                  className="h-3 rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${progressInfo.percentage}%` }}
                />
              </div>

              <div className="text-sm text-gray-500">
                {t('progressCompleted', {
                  completed: progressInfo.completed,
                  total: progressInfo.total,
                })}
              </div>
            </div>
          </div>
        ) : null}

        <p className="text-gray-500">{t('encouragementMessage')}</p>

        <div className="pt-6">
          <Link
            href={getAbsoluteUrl(`/course/${courseUuid.replace('course_', '')}`)}
            className="inline-flex items-center space-x-2 rounded-full bg-blue-600 px-6 py-3 text-white transition duration-200 hover:bg-blue-700"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>{t('continueActivity')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CourseEndView;
