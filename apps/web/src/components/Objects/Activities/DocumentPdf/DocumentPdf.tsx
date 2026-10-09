import { getActivityMediaDirectory } from '@services/media/media'
import { Download, ExternalLink } from 'lucide-react'
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
  const linkClassName =
    'text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted'

  return (
    <div className="flex h-full w-full flex-col">
      <CheckedMedia url={src} kind="pdf">
        {/* Phone browsers (Android Chrome, in-app browsers) do not draw a PDF inside an iframe:
            the lesson was a blank box there. Opening or saving the file always works. */}
        <div className="flex shrink-0 flex-wrap justify-end gap-1 border-b p-1.5">
          <a href={src} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            <ExternalLink className="size-4" aria-hidden="true" />
            {t('openInNewTab')}
          </a>
          <a href={src} download={`${activity.name || 'document'}.pdf`} className={linkClassName}>
            <Download className="size-4" aria-hidden="true" />
            {t('download')}
          </a>
        </div>
        <iframe className="min-h-0 w-full flex-1" title={t('viewerTitle')} src={src} />
      </CheckedMedia>
    </div>
  )
}

export default DocumentPdfActivity
