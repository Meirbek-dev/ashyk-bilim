import { getActivityMediaDirectory } from '@services/media/media'
import { useTranslations } from 'next-intl'
import { CheckedMedia } from '@components/Objects/Activities/Media/MediaUnavailable'

function DocumentPdfActivity({ activity, course }: { activity: AppActivity; course: AppCourse }) {
  const t = useTranslations('Activities.DocumentPdf')
  const content = activity.content as { filename?: string } | null | undefined
  const fileId = content?.filename ?? ''
  const src = getActivityMediaDirectory({
    courseUUID: course?.course_uuid ?? '',
    activityUUID: activity.activity_uuid,
    fileId,
    activityType: 'documentpdf',
  })

  return (
    <div className="h-full w-full">
      <CheckedMedia url={src} kind="pdf">
        <iframe className="h-full w-full" title={t('viewerTitle')} src={src} />
      </CheckedMedia>
    </div>
  )
}

export default DocumentPdfActivity
