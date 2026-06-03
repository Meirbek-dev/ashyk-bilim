import { getActivityMediaDirectory } from '@services/media/media'
import { useTranslations } from 'next-intl'

const DocumentPdfActivity = ({ activity, course }: { activity: AppActivity; course: AppCourse }) => {
  const t = useTranslations('Activities.DocumentPdf')
  const content = activity.content as { filename?: string } | null | undefined
  const fileId = content?.filename ?? ''

  return (
    <div className="h-full w-full">
      <iframe
        className="h-full w-full"
        title={t('viewerTitle')}
        src={getActivityMediaDirectory({
          courseUUID: course?.course_uuid ?? '',
          activityUUID: activity.activity_uuid,
          fileId,
          activityType: 'documentpdf',
        })}
      />
    </div>
  )
}

export default DocumentPdfActivity
