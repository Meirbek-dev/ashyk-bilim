import ArtPlayer from '@components/Objects/Activities/Video/Artplayer';
import { getActivityMediaDirectory } from '@services/media/media';
import type ArtplayerType from 'artplayer';
import { useLocale, useTranslations } from 'next-intl';

// Function to extract YouTube video ID from various YouTube URL formats
function getYouTubeID(url: string): string | null {
  if (!url) return null;

  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/;
  const match = regex.exec(url);

  return match?.[1] || null;
}

interface VideoDetails {
  startTime?: number;
  endTime?: number | null;
  autoplay?: boolean;
  muted?: boolean;
  subtitles?: {
    language: string;
    filename: string;
    label: string;
    url: string;
  }[];
}

interface SubtitleEntry {
  html: string;
  url: string;
}

interface VideoActivityProps {
  activity: {
    activity_sub_type: string;
    activity_uuid: string;
    content: {
      filename?: string;
      uri?: string;
    };
    details?: VideoDetails;
  };
  course: {
    course_uuid: string;
  };
}

const VideoActivity = ({ activity, course }: VideoActivityProps) => {
  const fullLocale = useLocale();
  const t = useTranslations('Components.Video');
  const locale = fullLocale.split('-')[0];

  // Extract YouTube ID from activity content
  const videoId = activity?.content?.uri ? getYouTubeID(activity.content.uri) || '' : '';

  // Generate subtitle entries from activity details
  const subtitleEntries: SubtitleEntry[] = (activity?.details?.subtitles || [])
    .map((subtitle) => {
      const url = getActivityMediaDirectory({
        courseUUID: course.course_uuid,
        activityUUID: activity.activity_uuid,
        fileId: subtitle.filename,
        activityType: 'video',
      });
      return url ? { html: subtitle.label, url } : null;
    })
    .filter((entry): entry is SubtitleEntry => entry !== null);

  // Get default subtitle URL for current locale
  const getDefaultSubtitleUrl = () => {
    const subtitles = activity?.details?.subtitles || [];
    const defaultSubtitle = subtitles.find((s) => s.language === locale);
    if (defaultSubtitle) {
      return (
        getActivityMediaDirectory({
          courseUUID: course.course_uuid,
          activityUUID: activity.activity_uuid,
          fileId: defaultSubtitle.filename,
          activityType: 'video',
        }) ?? ''
      );
    }
    return '';
  };

  const getVideoSrc = () => {
    if (!activity.content?.filename) return '';
    return (
      getActivityMediaDirectory({
        courseUUID: course.course_uuid,
        activityUUID: activity.activity_uuid,
        fileId: activity.content.filename,
        activityType: 'video',
      }) ?? ''
    );
  };

  return (
    <div className="w-full max-w-full px-2 sm:px-4">
      {activity ? (
        <div className="my-3 w-full md:my-5">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg shadow-xs ring-1 ring-gray-300/30 sm:shadow-none sm:ring-gray-200/10 dark:ring-gray-600/30 sm:dark:ring-gray-700/20">
            {activity.activity_sub_type === 'SUBTYPE_VIDEO_HOSTED' && (
              <ArtPlayer
                option={{
                  url: getVideoSrc(),
                  muted: activity.details?.muted,
                  autoplay: activity.details?.autoplay,
                  lang: locale,
                  pip: false,
                }}
                subtitle={
                  getDefaultSubtitleUrl()
                    ? {
                        url: getDefaultSubtitleUrl(),
                        type: 'srt',
                        style: {
                          color: '#ffffff',
                          fontSize: '2.5rem',
                          backgroundColor: 'rgba(0, 0, 0, 0.8)',
                          textAlign: 'center',
                        },
                        encoding: 'utf8',
                      }
                    : undefined
                }
                locale={locale}
                subtitleEntries={subtitleEntries}
                className="size-full"
                startTime={activity.details?.startTime}
                endTime={activity.details?.endTime}
                onPlayerReady={(_art: ArtplayerType) => {}}
              />
            )}
            {activity.activity_sub_type === 'SUBTYPE_VIDEO_YOUTUBE' && videoId && (
              <iframe
                className="size-full"
                src={`https://www.youtube.com/embed/${videoId}?${new URLSearchParams({
                  autoplay: activity.details?.autoplay ? '1' : '0',
                  mute: activity.details?.muted ? '1' : '0',
                  start: String(activity.details?.startTime || 0),
                  ...(activity.details?.endTime && { end: String(activity.details.endTime) }),
                  controls: '1',
                  modestbranding: '1',
                  rel: '0',
                }).toString()}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                title={t('youtubePlayer')}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VideoActivity;
