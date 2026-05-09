'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileVideo,
  Info,
  Languages,
  Loader2,
  Play,
  Plus,
  Settings,
  Trash2,
  Upload,
  UploadCloud,
  VolumeX,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import type { ChangeEvent, ComponentType, DragEvent } from 'react';
import { SiYoutube } from '@icons-pack/react-simple-icons';
import { constructAcceptValue } from '@/lib/constants';
import { AnimatePresence, motion } from 'motion/react';
import { Separator } from '@components/ui/separator';
import { Checkbox } from '@components/ui/checkbox';
import { useEffect, useId, useState } from 'react';
import { Button } from '@components/ui/button';
import { cn, generateUUID } from '@/lib/utils';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const SUPPORTED_VIDEO_FILES = constructAcceptValue(['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv']);
const SUPPORTED_SUBTITLE_FILES = constructAcceptValue(['srt', 'vtt']);

interface SubtitleFile {
  id: string;
  file: File;
  language: string;
  label: string;
}

interface VideoDetails {
  startTime: number;
  endTime: number | null;
  autoplay: boolean;
  muted: boolean;
  subtitles?: SubtitleFile[];
}

interface ExternalVideoObject {
  name: string;
  type: string;
  uri: string;
  chapter_id: number;
  details: VideoDetails;
}

const getLocalizedLanguageOptions = (t: any) => [
  { code: 'en', label: t('languageEnglish'), flag: '🇺🇸' },
  { code: 'ru', label: t('languageRussian'), flag: '🇷🇺' },
  { code: 'kz', label: t('languageKazakh'), flag: '🇰🇿' },
  { code: 'fr', label: t('languageFrench'), flag: '🇫🇷' },
  { code: 'es', label: t('languageSpanish'), flag: '🇪🇸' },
  { code: 'de', label: t('languageGerman'), flag: '🇩🇪' },
];

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const TimeInput = ({
  label,
  icon: Icon,
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  placeholder,
  disabled = false,
  t,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  minutes: number;
  seconds: number;
  onMinutesChange: (minutes: number) => void;
  onSecondsChange: (seconds: number) => void;
  placeholder: string;
  disabled?: boolean;
  t: any;
}) => (
  <div className="space-y-2">
    <Label className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-400 uppercase">
      <Icon
        size={13}
        className="text-gray-400"
      />
      {label}
    </Label>
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Input
          type="number"
          min="0"
          value={minutes}
          onChange={(e) => onMinutesChange(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
          placeholder="0"
          className="h-9 text-center tabular-nums"
          disabled={disabled}
        />
        <span className="mt-1 block text-center text-xs text-gray-400">{t('minutes')}</span>
      </div>
      <span className="pb-5 text-lg font-light text-gray-300">:</span>
      <div className="flex-1">
        <Input
          type="number"
          min="0"
          max="59"
          value={seconds}
          onChange={(e) => onSecondsChange(Math.max(0, Math.min(59, Number.parseInt(e.target.value, 10) || 0)))}
          placeholder="00"
          className="h-9 text-center tabular-nums"
          disabled={disabled}
        />
        <span className="mt-1 block text-center text-xs text-gray-400">{t('seconds')}</span>
      </div>
    </div>
    <p className="text-xs text-gray-400 tabular-nums">{formatTime(minutes * 60 + seconds)}</p>
  </div>
);

const SubtitleManager = ({
  subtitles,
  setSubtitles,
  t,
}: {
  subtitles: SubtitleFile[];
  setSubtitles: (subtitles: SubtitleFile[]) => void;
  t: any;
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

  function validateSubtitleFile(file: File): { valid: boolean; error?: string } {
    if (!(file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt'))) {
      return { valid: false, error: t('errorSubtitleFileType') };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { valid: false, error: t('errorSubtitleFileSize') };
    }
    const fileName = file.name.toLowerCase();
    const potentialLang = fileName.split('.').slice(-2, -1)[0];
    const existingLang = subtitles.find((s) => s.language === potentialLang || s.file.name.toLowerCase() === fileName);
    if (existingLang) {
      return { valid: false, error: t('errorSubtitleLanguageExists', { language: potentialLang }) };
    }
    return { valid: true };
  }

  async function addSubtitle(file: File, language: string, label: string) {
    const validation = validateSubtitleFile(file);
    if (!validation.valid) {
      toast.error(validation.error || t('errorInvalidSubtitleFile'));
      return;
    }
    const fileId = generateUUID();
    setUploadingFiles((prev) => [...prev, fileId]);
    try {
      setSubtitles([...subtitles, { id: fileId, file, language, label }]);
      toast.success(t('successSubtitleAdded', { label }));
    } catch {
      toast.error(t('errorFailedToAddSubtitle'));
    } finally {
      setUploadingFiles((prev) => prev.filter((id) => id !== fileId));
    }
  }

  function removeSubtitle(id: string) {
    const subtitleToRemove = subtitles.find((s) => s.id === id);
    setSubtitles(subtitles.filter((subtitle) => subtitle.id !== id));
    if (subtitleToRemove) {
      toast.success(t('successSubtitleRemoved', { label: subtitleToRemove.label }));
    }
  }

  function updateSubtitle(id: string, language: string, label: string) {
    setSubtitles(subtitles.map((s) => (s.id === id ? { ...s, language, label } : s)));
    toast.success(t('successSubtitleLanguageUpdated'));
  }

  function handleSubtitleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];
    if (files.length === 0) return;
    files.forEach((file) => {
      const fileName = file.name.toLowerCase();
      const parts = fileName.split('.');
      const potentialLang = parts.length > 2 ? parts[parts.length - 2] : '';
      const detectedLang = getLocalizedLanguageOptions(t).find(
        (lang) => lang.code === potentialLang || fileName.includes(lang.code),
      );
      addSubtitle(file, detectedLang?.code ?? 'en', detectedLang?.label ?? t('languageEnglish'));
    });
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const files = [...event.dataTransfer.files];
    const subtitleFiles = files.filter(
      (file) => file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt'),
    );
    if (subtitleFiles.length === 0) {
      toast.error(t('errorDropSubtitleFilesOnly'));
      return;
    }
    if (subtitleFiles.length > 5) {
      toast.error(t('errorMaxSubtitleFiles'));
      return;
    }
    subtitleFiles.forEach((file) => {
      const fileName = file.name.toLowerCase();
      const parts = fileName.split('.');
      const potentialLang = parts.length > 2 ? parts[parts.length - 2] : '';
      const detectedLang = getLocalizedLanguageOptions(t).find(
        (lang) => lang.code === potentialLang || fileName.includes(lang.code),
      );
      addSubtitle(file, detectedLang?.code ?? 'en', detectedLang?.label ?? t('languageEnglish'));
    });
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
  }

  const fileInputId = `subtitle-upload-${useId()}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{t('subtitles')}</span>
          {subtitles.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
              {subtitles.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {subtitles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSubtitles([]);
                toast.success(t('successAllSubtitlesRemoved'));
              }}
              className="h-7 px-2 text-xs text-gray-400 hover:text-red-500"
            >
              {t('clearAll')}
            </Button>
          )}
          <input
            type="file"
            accept={SUPPORTED_SUBTITLE_FILES}
            onChange={handleSubtitleUpload}
            className="hidden"
            id={fileInputId}
            multiple
            aria-label={t('ariaUploadSubtitleFile')}
          />
          <Label
            htmlFor={fileInputId}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Plus size={13} />
            {t('addSubtitle')}
          </Label>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-colors duration-150',
          dragOver
            ? 'border-blue-300 bg-blue-50/40'
            : subtitles.length === 0
              ? 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
              : 'border-gray-200 hover:border-gray-300',
          subtitles.length === 0 ? 'p-8' : 'p-3',
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-blue-50/80">
            <p className="text-sm font-medium text-blue-600">{t('dropSubtitleFilesHere')}</p>
          </div>
        )}

        {subtitles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadCloud
              size={20}
              className="text-gray-300"
            />
            <p className="text-sm text-gray-500">{t('noSubtitlesYet')}</p>
            <p className="text-xs text-gray-400">{t('dragDropSubtitlesInstruction')}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 size={11} />
                {t('subtitleFormatsSupported')}
              </span>
              <span className="flex items-center gap-1">
                <Info size={11} />
                {t('subtitleFileSizeLimit')}
              </span>
            </div>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <UploadCloud size={12} />
            {t('dragAdditionalSubtitles')}
          </p>
        )}
      </div>

      {/* Processing indicator */}
      <AnimatePresence>
        {uploadingFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-xs text-gray-500"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{t('processingFiles', { count: uploadingFiles.length })}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtitle List */}
      <AnimatePresence>
        {subtitles.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            {subtitles.map((subtitle) => (
              <motion.div
                key={subtitle.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="group flex items-center gap-3 px-3 py-2.5"
              >
                <Languages
                  size={14}
                  className="shrink-0 text-gray-300"
                />
                <span
                  className="min-w-0 flex-1 truncate text-sm text-gray-700"
                  title={subtitle.file.name}
                >
                  {subtitle.file.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 border-gray-200 px-2 text-xs"
                      >
                        <span>
                          {getLocalizedLanguageOptions(t).find((lang) => lang.code === subtitle.language)?.flag}
                        </span>
                        {subtitle.label}
                        <ChevronDown
                          size={10}
                          className="opacity-40"
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="w-44"
                  >
                    {getLocalizedLanguageOptions(t).map((lang) => (
                      <DropdownMenuItem
                        key={lang.code}
                        onClick={() => updateSubtitle(subtitle.id, lang.code, lang.label)}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span>{lang.flag}</span>
                        {lang.label}
                        {subtitle.language === lang.code && (
                          <CheckCircle2
                            size={13}
                            className="ml-auto text-blue-600"
                          />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-xs text-gray-400 tabular-nums">{(subtitle.file.size / 1024).toFixed(0)} KB</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSubtitle(subtitle.id)}
                  className="h-6 w-6 p-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                  aria-label={t('removeSubtitleAriaLabel', { filename: subtitle.file.name })}
                >
                  <Trash2 size={13} />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const VideoSettingsForm = ({
  videoDetails,
  setVideoDetails,
  t,
}: {
  videoDetails: VideoDetails;
  setVideoDetails: (details: VideoDetails) => void;
  t: any;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const subtitles = videoDetails.subtitles || [];

  const setSubtitles = (newSubtitles: SubtitleFile[]) => {
    setVideoDetails({ ...videoDetails, subtitles: newSubtitles });
  };

  const convertToSeconds = (minutes: number, seconds: number) => minutes * 60 + seconds;

  const convertFromSeconds = (totalSeconds: number) => ({
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  });

  const startTimeParts = convertFromSeconds(videoDetails.startTime);
  const endTimeParts = videoDetails.endTime ? convertFromSeconds(videoDetails.endTime) : { minutes: 0, seconds: 0 };

  const updateStartTime = (minutes: number, seconds: number) => {
    const newStartTime = convertToSeconds(minutes, seconds);
    setVideoDetails({
      ...videoDetails,
      startTime: newStartTime,
      endTime: videoDetails.endTime && videoDetails.endTime <= newStartTime ? null : videoDetails.endTime,
    });
  };

  const updateEndTime = (minutes: number, seconds: number) => {
    const totalSeconds = convertToSeconds(minutes, seconds);
    if (totalSeconds > videoDetails.startTime) {
      setVideoDetails({ ...videoDetails, endTime: totalSeconds });
    }
  };

  const settingsCount = [
    videoDetails.startTime > 0,
    Boolean(videoDetails.endTime),
    videoDetails.autoplay,
    videoDetails.muted,
    subtitles.length > 0,
  ].filter(Boolean).length;

  const hasTimingErrors = Boolean(videoDetails.endTime && videoDetails.endTime <= videoDetails.startTime);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger
        nativeButton={false}
        render={
          <div className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <Settings
                size={15}
                className="text-gray-400"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">{t('additionalSettings')}</span>
                <p className="text-xs text-gray-400">{t('additionalSettingsDescription')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settingsCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-50 px-1.5 text-xs font-medium text-blue-600">
                  {settingsCount}
                </span>
              )}
              <ChevronDown
                size={15}
                className={cn('text-gray-400 transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </div>
          </div>
        }
      />

      <CollapsibleContent className="overflow-hidden">
        <div className="mt-2 space-y-5 rounded-lg border border-gray-200 bg-white p-5">
          {/* Timing Controls */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
              <Clock size={13} />
              {t('timingControls')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <TimeInput
                label={t('startTimeLabel')}
                icon={Play}
                minutes={startTimeParts.minutes}
                seconds={startTimeParts.seconds}
                onMinutesChange={(minutes) => updateStartTime(minutes, startTimeParts.seconds)}
                onSecondsChange={(seconds) => updateStartTime(startTimeParts.minutes, seconds)}
                placeholder={t('minutesPlaceholder')}
                t={t}
              />
              <TimeInput
                label={t('endTimeLabel')}
                icon={Clock}
                minutes={endTimeParts.minutes}
                seconds={endTimeParts.seconds}
                onMinutesChange={(minutes) => updateEndTime(minutes, endTimeParts.seconds)}
                onSecondsChange={(seconds) => updateEndTime(endTimeParts.minutes, seconds)}
                placeholder={t('minutesPlaceholder')}
                disabled={hasTimingErrors}
                t={t}
              />
            </div>
            {hasTimingErrors && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <AlertTriangle
                  size={14}
                  className="mt-0.5 shrink-0 text-amber-500"
                />
                <div>
                  <p className="text-xs font-medium text-amber-700">{t('invalidTimeRange')}</p>
                  <p className="text-xs text-amber-600">
                    {t('endTimeGreaterThanStartTime', { startTime: formatTime(videoDetails.startTime) })}
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          <Separator />

          {/* Playback Options */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
              <Play size={13} />
              {t('playbackOptions')}
            </h4>
            <div className="space-y-2">
              <Label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5 transition-colors hover:bg-gray-50">
                <Checkbox
                  checked={videoDetails.autoplay}
                  onCheckedChange={(checked) => setVideoDetails({ ...videoDetails, autoplay: checked })}
                />
                <div className="flex items-center gap-2">
                  <Play
                    size={14}
                    className="shrink-0 text-gray-400"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">{t('autoplay')}</span>
                    <p className="text-xs text-gray-400">{t('autoplayDescription')}</p>
                  </div>
                </div>
              </Label>
              <Label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5 transition-colors hover:bg-gray-50">
                <Checkbox
                  checked={videoDetails.muted}
                  onCheckedChange={(checked) => setVideoDetails({ ...videoDetails, muted: checked })}
                />
                <div className="flex items-center gap-2">
                  <VolumeX
                    size={14}
                    className="shrink-0 text-gray-400"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">{t('startMuted')}</span>
                    <p className="text-xs text-gray-400">{t('startMutedDescription')}</p>
                  </div>
                </div>
              </Label>
            </div>
          </div>

          <Separator />

          {/* Subtitles */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
              <Languages size={13} />
              {t('subtitlesAndCaptions')}
            </h4>
            <SubtitleManager
              subtitles={subtitles}
              setSubtitles={setSubtitles}
              t={t}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const VideoModal = ({ submitFileActivity, submitExternalVideo, chapterId, course }: any) => {
  const t = useTranslations('Components.VideoModal');
  const platform = usePlatform();
  const [video, setVideo] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedView, setSelectedView] = useState<'file' | 'youtube'>('file');
  const [videoDetails, setVideoDetails] = useState<VideoDetails>({
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
    subtitles: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Debug: Log platform data when component mounts or platform changes
  useEffect(() => {
    console.log('VideoModal - Context data:', {
      platform,
      hasPlatform: Boolean(platform),
      courseProp: course,
      courseData: course?.courseStructure || course,
    });
  }, [platform, course]);

  const isYouTubeUrlValid = youtubeUrl ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(youtubeUrl) : false;

  const validateForm = ({
    activityName,
    sourceType,
    selectedVideo,
    submittedYoutubeUrl,
  }: {
    activityName: string;
    sourceType: 'file' | 'youtube';
    selectedVideo: File | null;
    submittedYoutubeUrl: string;
  }) => {
    const newErrors: Record<string, string> = {};

    const youtubeUrlIsValid = submittedYoutubeUrl
      ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(submittedYoutubeUrl)
      : false;

    if (!activityName.trim()) {
      newErrors.name = t('errorActivityNameRequired');
    }

    if (sourceType === 'file' && !selectedVideo) {
      newErrors.video = t('errorPleaseSelectVideoFile');
    }

    if (sourceType === 'youtube' && !submittedYoutubeUrl.trim()) {
      newErrors.youtubeUrl = t('errorYouTubeUrlRequired');
    }

    if (sourceType === 'youtube' && submittedYoutubeUrl && !youtubeUrlIsValid) {
      newErrors.youtubeUrl = t('errorValidYouTubeUrl');
    }

    if (videoDetails.endTime && videoDetails.endTime <= videoDetails.startTime) {
      newErrors.timing = t('errorEndTimeGreaterThanStartTime');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file size (max 1000MB)
      if (selectedFile.size > 1000 * 1024 * 1024) {
        toast.error(t('errorFileSizeLimit'));
        return;
      }

      // Validate file type
      const validTypes = ['video/mp4', 'video/webm', 'video/x-matroska'];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error(t('errorInvalidVideoFileType'));
        return;
      }

      setVideo(selectedFile);
      setErrors((prev) => ({ ...prev, video: '' }));

      // Auto-populate name if empty
      if (!name) {
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
        setName(fileName);
        setErrors((prev) => ({ ...prev, name: '' }));
      }

      toast.success(t('successVideoFileSelected'));
    }
  };

  const canSubmit = (() => {
    if (!name.trim()) return false;
    if (selectedView === 'file') return Boolean(video);
    if (selectedView === 'youtube') return isYouTubeUrlValid;
    return false;
  })();

  const handleSubmit = async (formData: FormData) => {
    const submittedName = String(formData.get('name') ?? '').trim();
    const submittedYoutubeUrl = String(formData.get('youtubeUrl') ?? '').trim();
    const submittedVideo = formData.get('videoFile');
    const selectedVideo = submittedVideo instanceof File && submittedVideo.size > 0 ? submittedVideo : video;

    if (
      !validateForm({
        activityName: submittedName,
        sourceType: selectedView,
        selectedVideo,
        submittedYoutubeUrl,
      })
    ) {
      toast.error(t('errorFixErrorsBeforeSubmitting'));
      return;
    }

    // Handle course data structure (it might be the context object or the course object directly)
    const courseData = course?.courseStructure || course;

    if (!courseData?.course_uuid) {
      console.error('Course data missing:', course);
      toast.error(t('courseDataMissing'));
      return;
    }

    setIsSubmitting(true);

    try {
      if (selectedView === 'file' && selectedVideo) {
        await submitFileActivity({
          file: selectedVideo,
          type: 'video',
          activity: {
            name: submittedName,
            chapter_id: chapterId,
            activity_type: 'TYPE_VIDEO',
            activity_sub_type: 'SUBTYPE_VIDEO_HOSTED',
            details: videoDetails,
          },
          chapterId,
        });
        toast.success(t('successVideoActivityCreated'));
      }

      if (selectedView === 'youtube') {
        const external_video_object: ExternalVideoObject = {
          name: submittedName,
          type: 'youtube',
          uri: submittedYoutubeUrl,
          chapter_id: chapterId,
          details: videoDetails,
        };

        await submitExternalVideo(external_video_object, 'activity', chapterId);
        toast.success(t('successYouTubeVideoActivityCreated'));
      }
    } catch (error) {
      console.error('Error creating video activity:', error);
      toast.error(t('errorFailedToCreateVideoActivity'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileInputId = `video-activity-file-${useId()}`;

  return (
    <div className="mx-auto max-w-2xl">
      <form
        action={handleSubmit}
        className="space-y-5"
      >
        {/* Header */}
        <div className="border-b border-gray-100 pb-4">
          <div className="mb-1 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <FileVideo
                size={16}
                className="text-gray-600"
              />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{t('createVideoActivity')}</h2>
          </div>
          <p className="ml-[42px] text-sm text-gray-500">{t('createVideoActivityDescription')}</p>
        </div>

        {/* Activity Name */}
        <div className="space-y-1.5">
          <Label
            htmlFor="video-activity-name"
            className="text-sm font-medium text-gray-700"
          >
            {t('activityName')} <span className="text-red-400">*</span>
          </Label>
          <Input
            id="video-activity-name"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            type="text"
            required
            placeholder={t('activityNamePlaceholder')}
            className={cn('h-9', errors.name && 'border-red-300 focus-visible:ring-red-200')}
          />
          {errors.name && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1 text-xs text-red-500"
            >
              <AlertCircle size={12} />
              {errors.name}
            </motion.p>
          )}
        </div>

        {/* Video Source */}
        <div className="space-y-3">
          {/* Segmented Control */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setSelectedView('file');
                setErrors((prev) => ({ ...prev, youtubeUrl: '' }));
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150',
                selectedView === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Upload size={15} />
              {t('uploadVideo')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedView('youtube');
                setErrors((prev) => ({ ...prev, video: '' }));
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150',
                selectedView === 'youtube' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <SiYoutube size={15} />
              {t('youtubeVideo')}
            </button>
          </div>

          {/* Panel Content */}
          <AnimatePresence mode="wait">
            {selectedView === 'file' && (
              <motion.div
                key="file"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-2"
              >
                <input
                  id={fileInputId}
                  name="videoFile"
                  type="file"
                  accept={SUPPORTED_VIDEO_FILES}
                  onChange={handleVideoChange}
                  className="hidden"
                  aria-label={t('ariaLabel')}
                />
                {video ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
                        <FileVideo
                          size={16}
                          className="text-gray-400"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-xs truncate text-sm font-medium text-gray-800">{video.name}</p>
                        <p className="text-xs text-gray-400">{(video.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                    </div>
                    <Label
                      htmlFor={fileInputId}
                      className="cursor-pointer text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
                    >
                      {t('chooseVideoFile')}
                    </Label>
                  </div>
                ) : (
                  <Label
                    htmlFor={fileInputId}
                    className={cn(
                      'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-10 text-center transition-colors hover:border-gray-300 hover:bg-gray-50',
                      errors.video && 'border-red-200 bg-red-50/30',
                    )}
                  >
                    <Upload
                      size={22}
                      className="text-gray-300"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-600">{t('chooseVideoFile')}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{t('supportedFormatsAndSize')}</p>
                    </div>
                  </Label>
                )}
                {errors.video && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1 text-xs text-red-500"
                  >
                    <AlertCircle size={12} />
                    {errors.video}
                  </motion.p>
                )}
              </motion.div>
            )}

            {selectedView === 'youtube' && (
              <motion.div
                key="youtube"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-2"
              >
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <SiYoutube
                      size={15}
                      className="text-gray-300"
                    />
                  </div>
                  <Input
                    id="youtube-url"
                    name="youtubeUrl"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      setErrors((prev) => ({ ...prev, youtubeUrl: '' }));
                    }}
                    type="url"
                    required
                    placeholder={t('youtubeUrlPlaceholder')}
                    className={cn(
                      'h-9 pl-9',
                      errors.youtubeUrl
                        ? 'border-red-300 focus-visible:ring-red-200'
                        : youtubeUrl && isYouTubeUrlValid
                          ? 'border-emerald-300 focus-visible:ring-emerald-200'
                          : '',
                    )}
                  />
                  {youtubeUrl && isYouTubeUrlValid && (
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-500"
                      />
                    </div>
                  )}
                </div>
                {errors.youtubeUrl && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1 text-xs text-red-500"
                  >
                    <AlertCircle size={12} />
                    {errors.youtubeUrl}
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Advanced Settings */}
        <VideoSettingsForm
          videoDetails={videoDetails}
          setVideoDetails={setVideoDetails}
          t={t}
        />

        {errors.timing && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2"
          >
            <AlertTriangle
              size={14}
              className="shrink-0 text-red-400"
            />
            <p className="text-xs text-red-600">{errors.timing}</p>
          </motion.div>
        )}

        {/* Submit */}
        <div className="flex justify-end border-t border-gray-100 pt-4">
          <Button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            size="sm"
            className="gap-2 px-5"
          >
            {isSubmitting ? (
              <>
                <Loader2
                  size={14}
                  className="animate-spin"
                />
                {t('creating')}
              </>
            ) : (
              <>
                <Plus size={14} />
                {t('createActivity')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default VideoModal;
