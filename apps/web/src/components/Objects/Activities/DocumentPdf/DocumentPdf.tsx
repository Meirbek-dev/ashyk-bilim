import { getActivityMediaDirectory } from '@services/media/media';
import { useTranslations } from 'next-intl';

const DocumentPdfActivity = ({ activity, course }: { activity: any; course: any }) => {
  const t = useTranslations('Activities.DocumentPdf');

  return (
    <div className="h-full w-full">
      <iframe
        className="h-full w-full"
        title={t('viewerTitle')}
        src={getActivityMediaDirectory({
          courseUUID: course?.course_uuid ?? '',
          activityUUID: activity.activity_uuid,
          fileId: activity.content.filename,
          activityType: 'documentpdf',
        })}
      />
    </div>
  );
};

export default DocumentPdfActivity;
