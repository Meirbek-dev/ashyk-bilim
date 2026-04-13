import { getActivityMediaDirectory } from '@services/media/media';
import { useTranslations } from 'next-intl';

const DocumentPdfActivity = ({ activity, course }: { activity: any; course: any }) => {
  const t = useTranslations('Activities.DocumentPdf');

  return (
    <div className="m-8 mt-14 rounded-md bg-zinc-900">
      <iframe
        className="h-[900px] w-full rounded-lg"
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
