import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview'
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications'
import {
  downloadPdfBlob,
  generateCertificatePdfBlob,
  sanitizePdfFileName,
} from '@/features/certifications/utils/pdfmeCertificate'
import { ArrowLeft, BookOpen, Download, Loader2, Shield, Target, Trophy } from 'lucide-react'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import SimpleAlertDialog from '@/components/ui/alert-dialog-simple'
import { useGamificationStore } from '@/stores/gamification'
import { getAbsoluteUrl } from '@services/config/config'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
// Gamification imports
import { LevelProgress } from '@/lib/gamification'
import NextImage from '@components/ui/NextImage'
import Link from '@components/ui/ServerLink'
import confetti from 'canvas-confetti'
import type { FC } from 'react'

interface CourseEndViewProps {
  courseName: string
  courseUuid: string
  thumbnailImage: string
  course: AppCourse
  trailData: AppTrailData
}

const CourseEndView: FC<CourseEndViewProps> = ({ courseName, courseUuid, thumbnailImage, course, trailData }) => {
  const locale = useLocale()
  const t = useTranslations('Certificates.CourseEndView')
  const [dialogAlertOpen, setDialogAlertOpen] = useState(false)
  const [dialogAlertMessage, setDialogAlertMessage] = useState('')

  const gamificationProfile = useGamificationStore(s => s.profile)
  const gamificationRefetch = useGamificationStore(s => s.refetch)

  const refetchedOnMountRef = useRef(false)
  const refetchedOnCertificateRef = useRef(false)

  // Check if course is actually completed
  const isCourseCompleted = (() => {
    if (!(trailData && course)) return false

    // Flatten all activities
    const allActivities = (course.chapters ?? []).flatMap((chapter: AppChapter) =>
      (chapter.activities ?? []).map((activity: AppActivity) => (Object.assign(activity, { chapterId: chapter.id }))),
    )

    // Check if all activities are completed
    const isActivityDone = (activity: AppActivity) => {
      const cleanCourseUuid = course.course_uuid?.replace('course_', '')
      const run = trailData?.runs?.find((activeRun: AppTrailRun) => {
        const cleanRunCourseUuid = activeRun.course?.course_uuid?.replace('course_', '')
        return cleanRunCourseUuid === cleanCourseUuid
      })

      if (run) {
        return (run.steps ?? []).find((step: AppTrailStep) => step.activity_id === activity.id && step.complete === true)
      }
      return false
    }

    const totalActivities = allActivities.length
    const completedActivities = allActivities.filter((activity: AppActivity) => isActivityDone(activity)).length
    return totalActivities > 0 && completedActivities === totalActivities
  })()
  const normalizedCourseUuid = courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`
  const certificateQuery = useUserCertificateByCourse(isCourseCompleted ? normalizedCourseUuid : null)
  const userCertificate = certificateQuery.data?.data?.[0] ?? null
  const isLoadingCertificate = isCourseCompleted && certificateQuery.isPending
  const certificateError = certificateQuery.error
    ? t('loadingError')
    : !isLoadingCertificate && isCourseCompleted && !userCertificate
      ? t('noCertificateFound')
      : null
  const qrCodeLink = getAbsoluteUrl(`/certificates/${userCertificate?.certificate_user.user_certification_uuid}/verify`)

  useEffect(() => {
    if (!userCertificate || typeof gamificationRefetch !== 'function') return
    if (refetchedOnCertificateRef.current) return

    refetchedOnCertificateRef.current = true
    gamificationRefetch().catch((error: unknown) =>
      console.warn('Failed to refetch gamification after course completion:', error),
    )
  }, [userCertificate, gamificationRefetch])

  // Refetch gamification data on mount if course is completed
  // This ensures recent activity feed shows course completion XP
  useEffect(() => {
    if (!isCourseCompleted || typeof gamificationRefetch !== 'function') return

    // Ensure we only trigger this refetch once on mount after completion
    if (refetchedOnMountRef.current) return
    refetchedOnMountRef.current = true

    const timer = setTimeout(() => {
      gamificationRefetch().catch((error: unknown) =>
        console.warn('Failed to refetch gamification on CourseEndView mount:', error),
      )
    }, 1000)
    return () => clearTimeout(timer)
  }, [isCourseCompleted, gamificationRefetch])

  useEffect(() => {
    if (!isCourseCompleted) return

    const colors = ['#6366f1', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#ffffff']

    // Big opening bursts
    confetti({
      particleCount: 140,
      spread: 100,
      origin: { y: 0.4 },
      scalar: 1.6,
      ticks: 400,
      colors,
    })
    const t1 = setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 80,
        shapes: ['star'],
        scalar: 2.2,
        origin: { y: 0.4 },
        ticks: 350,
        colors,
      })
    }, 200)
    const t2 = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.2, y: 0.5 },
        scalar: 1.5,
        ticks: 300,
        colors,
      })
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.8, y: 0.5 },
        scalar: 1.5,
        ticks: 300,
        colors,
      })
    }, 500)

    // Continuous cannons from both sides for 3 seconds
    const end = Date.now() + 3000
    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval)
        return
      }
      confetti({
        particleCount: 7,
        angle: 60,
        spread: 58,
        origin: { x: 0, y: 0.65 },
        scalar: 1.4,
        ticks: 300,
        colors,
      })
      confetti({
        particleCount: 7,
        angle: 120,
        spread: 58,
        origin: { x: 1, y: 0.65 },
        scalar: 1.4,
        ticks: 300,
        colors,
      })
    }, 50)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearInterval(interval)
    }
  }, [isCourseCompleted])

  const getCertificationTypeLabel = (type: string) => {
    switch (type) {
      case 'completion': {
        return t('certificationTypes.completion')
      }
      case 'achievement': {
        return t('certificationTypes.achievement')
      }
      case 'assessment': {
        return t('certificationTypes.assessment')
      }
      case 'participation': {
        return t('certificationTypes.participation')
      }
      case 'mastery': {
        return t('certificationTypes.mastery')
      }
      case 'professional': {
        return t('certificationTypes.professional')
      }
      case 'continuing': {
        return t('certificationTypes.continuing')
      }
      case 'workshop': {
        return t('certificationTypes.workshop')
      }
      case 'specialization': {
        return t('certificationTypes.specialization')
      }
      default: {
        return t('certificationTypes.completion')
      }
    }
  }

  const downloadCertificate = async () => {
    if (!userCertificate) return

    try {
      const certificateId = userCertificate.certificate_user.user_certification_uuid
      const certificationName = userCertificate.certification.config.certification_name
      const blob = await generateCertificatePdfBlob({
        awardedDate: new Date(userCertificate.certificate_user.created_at).toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        certificateId,
        certificationDescription:
          userCertificate.certification.config.certification_description || t('defaultCertificationDescription'),
        certificationName,
        certificationTypeLabel: getCertificationTypeLabel(userCertificate.certification.config.certification_type),
        instructor: userCertificate.certification.config.certificate_instructor ?? null,
        labels: {
          authenticityGuaranteed: t('verifyCertificate'),
          awarded: t('labelAwarded'),
          badgeCheckIcon: t('badgeCheckIcon'),
          certificate: t('certificate'),
          certificateId: t('certificateId'),
          instructor: t('instructor'),
          verificationNote: t('certificateCanBeVerified'),
        },
        pattern: userCertificate.certification.config.certificate_pattern ?? '',
        verificationUrl: qrCodeLink,
      })

      downloadPdfBlob(blob, `${sanitizePdfFileName(certificationName)}_Certificate.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
      setDialogAlertMessage(t('errorGeneratingPDF'))
      setDialogAlertOpen(true)
    }
  }

  // Calculate progress for incomplete courses
  const progressInfo = (() => {
    if (!(trailData && course) || isCourseCompleted) return null

    const allActivities = (course.chapters ?? []).flatMap((chapter: AppChapter) =>
      (chapter.activities ?? []).map((activity: AppActivity) => (Object.assign(activity, { chapterId: chapter.id }))),
    )

    const isActivityDone = (activity: AppActivity) => {
      const cleanCourseUuid = course.course_uuid?.replace('course_', '')
      const run = trailData?.runs?.find((activeRun: AppTrailRun) => {
        const cleanRunCourseUuid = activeRun.course?.course_uuid?.replace('course_', '')
        return cleanRunCourseUuid === cleanCourseUuid
      })

      if (run) {
        return (run.steps ?? []).find((step: AppTrailStep) => step.activity_id === activity.id && step.complete === true)
      }
      return false
    }

    const totalActivities = allActivities.length
    const completedActivities = allActivities.filter((activity: AppActivity) => isActivityDone(activity)).length
    const progressPercentage = Math.round((completedActivities / totalActivities) * 100)

    return {
      completed: completedActivities,
      total: totalActivities,
      percentage: progressPercentage,
      percentageString: `${progressPercentage}%`,
    }
  })()

  if (isCourseCompleted) {
    const congratsText = `${t('congratulations')} 🎉`
    // Show congratulations for completed course
    return (
      <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <SimpleAlertDialog open={dialogAlertOpen} onOpenChange={setDialogAlertOpen} description={dialogAlertMessage} />
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

          <h1 className="text-4xl font-bold text-gray-900">{congratsText}</h1>

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
                      <LevelProgress profile={gamificationProfile} showMilestones={false} className="justify-center" />
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
              <div className="mx-auto max-w-2xl" id="certificate-preview">
                <div id="certificate-content">
                  <CertificatePreview
                    certificationName={userCertificate.certification.config.certification_name}
                    certificationDescription={userCertificate.certification.config.certification_description ?? ''}
                    certificationType={userCertificate.certification.config.certification_type}
                    certificatePattern={userCertificate.certification.config.certificate_pattern ?? ''}
                    certificateInstructor={userCertificate.certification.config.certificate_instructor ?? undefined}
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
              href={getAbsoluteUrl(`/course/${courseUuid.replace('course_', '')}`)}
              className="inline-flex items-center space-x-2 rounded-full bg-gray-800 px-6 py-3 text-white transition duration-200 hover:bg-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>{t('backToCourse')}</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const keepGoingText = `${t('keepGoing')} 💪`

  // Show progress and encouragement for incomplete course
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <SimpleAlertDialog open={dialogAlertOpen} onOpenChange={setDialogAlertOpen} description={dialogAlertMessage} />
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

        <h1 className="text-4xl font-bold text-gray-900">{keepGoingText}</h1>

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
                <span className="font-semibold text-gray-900">{progressInfo.percentageString}</span>
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
  )
}

export default CourseEndView
