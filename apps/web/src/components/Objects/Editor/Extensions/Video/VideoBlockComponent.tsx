'use client';

import { AlertCircle, ArrowLeftRight, CheckCircle2, Download, Expand, Loader2, Upload, Video, X } from 'lucide-react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import ArtPlayer from '@components/Objects/Activities/Video/Artplayer';
import { getActivityBlockMediaDirectory } from '@services/media/media';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { uploadNewVideoFile } from '@services/blocks/Video/video';
import { useCourse } from '@components/Contexts/CourseContext';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { constructAcceptValue } from '@/lib/constants';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import type ArtplayerType from 'artplayer';
import type { Node } from '@tiptap/core';
import { cn } from '@/lib/utils';

const SUPPORTED_FILES = constructAcceptValue(['webm', 'mkv', 'mp4', 'mov', 'avi', 'flv']);

const VIDEO_SIZES = {
  small: { width: 480, label: 'sizeSmall' },
  medium: { width: 720, label: 'sizeMedium' },
  large: { width: 960, label: 'sizeLarge' },
  full: { width: '100%', label: 'sizeFull' },
} as const;

type VideoSize = keyof typeof VIDEO_SIZES;

const sizeButtonCn = (isActive: boolean) =>
  cn(
    'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all duration-200 cursor-pointer border',
    isActive
      ? 'text-white bg-blue-500 border-blue-500 hover:bg-blue-600'
      : 'text-gray-600 bg-transparent border-gray-200 hover:bg-gray-50',
  );

interface Course {
  courseStructure: {
    course_uuid: string;
  };
}

interface EditorState {
  isEditable: boolean;
}

interface VideoBlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
  size: VideoSize;
}

type ExtendedNodeViewProps = {
  extension: Node & {
    options: {
      activity: {
        activity_uuid: string;
      };
    };
  };
} & Omit<NodeViewProps, 'extension'>;

const VideoBlockComponent = (props: ExtendedNodeViewProps) => {
  const t = useTranslations('DashPage.Editor.VideoBlock');
  const fullLocale = useLocale();
  const locale = fullLocale.split('-')[0];
  const { node, extension, updateAttributes } = props;
  usePlatform();
  const course = useCourse() as Course | null;

  const subtitleEntries = [
    { html: t('subtitles.russian'), url: '/subtitle.ru.srt' },
    { html: t('subtitles.english'), url: '/subtitle.en.srt' },
    { html: t('subtitles.kazakh'), url: '/subtitle.kz.srt' },
  ];
  const editorState = useEditorProvider();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadZoneRef = useRef<HTMLDivElement>(null);

  const initialBlockObject = (() => {
    if (!node.attrs.blockObject) return null;
    if ('size' in node.attrs.blockObject && typeof node.attrs.blockObject.size === 'string') {
      return node.attrs.blockObject as VideoBlockObject;
    }
    return null;
  })();

  const [_video, setVideo] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blockObject, setBlockObject] = useState(initialBlockObject || null);
  const [selectedSize, setSelectedSize] = useState<VideoSize>(initialBlockObject?.size || 'medium');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Update block object when size changes
  useEffect(() => {
    if (blockObject && blockObject.size !== selectedSize) {
      const newBlockObject = {
        ...blockObject,
        size: selectedSize,
      };
      setBlockObject(newBlockObject);
      updateAttributes({ blockObject: newBlockObject });
    }
  }, [selectedSize, blockObject, updateAttributes]);

  const isEditable = editorState?.isEditable;
  const fileId = blockObject ? `${blockObject.content.file_id}.${blockObject.content.file_format}` : null;

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideo(file);
      setError(null);
      handleUpload(file);
    }
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === uploadZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    const fileExtension = file?.name.split('.').pop()?.toLowerCase();

    if (file && fileExtension && ['mkv', 'mp4', 'webm'].includes(fileExtension)) {
      setVideo(file);
      setError(null);
      handleUpload(file);
    } else {
      setError(t('errorFormat'));
    }
  };

  // MANUAL REVIEW: progressIntervalRef tracks simulated upload progress. If uploads can be aborted, ensure abort handling clears intervals and timeouts as well.
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleUpload = async (file: File) => {
    try {
      setIsLoading(true);
      setError(null);
      setUploadProgress(0);

      // Simulate upload progress - store interval id in a ref so we can clear it on unmount
      progressIntervalRef.current = globalThis.setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const tempBlockUuid = `block_temp_${Date.now()}`;

      const object = await uploadNewVideoFile(
        file,
        extension.options.activity.activity_uuid,
        course?.courseStructure.course_uuid,
        tempBlockUuid,
      );

      // If we got a temporary block, set it immediately so UI updates predictably
      if (object?.block_uuid && object.content) {
        const optimisticBlock = {
          ...object,
          size: selectedSize,
        };
        setBlockObject(optimisticBlock);
        updateAttributes({ blockObject: optimisticBlock });
      }

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadProgress(100);

      const newBlockObject = {
        ...object,
        size: selectedSize,
      };
      setBlockObject(newBlockObject);
      updateAttributes({ blockObject: newBlockObject });
      setVideo(null);

      // Reset progress after a delay
      uploadResetTimeoutRef.current = globalThis.setTimeout(() => {
        setUploadProgress(0);
      }, 1000);
    } catch (error: any) {
      console.error(t('errorUpload'), error);
      setError(error?.message || t('errorUpload'));
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    setBlockObject(null);
    updateAttributes({ blockObject: null });
    setVideo(null);
    setError(null);
    setUploadProgress(0);
  };

  const handleSizeChange = (size: VideoSize) => {
    setSelectedSize(size);
  };
  // Clear any pending timeouts or intervals on unmount
  useEffect(() => {
    return () => {
      if (uploadResetTimeoutRef.current) {
        clearTimeout(uploadResetTimeoutRef.current);
        uploadResetTimeoutRef.current = null;
      }
      // Ensure any progress simulation interval is cleared on unmount
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  const videoUrl =
    blockObject && course?.courseStructure.course_uuid
      ? getActivityBlockMediaDirectory({
          courseId: course.courseStructure.course_uuid,
          activityId: extension.options.activity.activity_uuid,
          blockId: blockObject.block_uuid,
          fileId: fileId || '',
          type: 'videoBlock',
        })
      : null;

  const handleDownload = () => {
    if (!videoUrl) return;

    // Create a temporary link element
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `video-${blockObject?.block_uuid || 'download'}.${blockObject?.content.file_format || 'mp4'}`;
    link.setAttribute('download', '');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExpand = () => {
    setIsModalOpen(true);
  };

  // If we're in preview mode and have a video, show only the video player
  if (!isEditable && blockObject && videoUrl) {
    const { width } = VIDEO_SIZES[blockObject.size];
    return (
      <>
        <NodeViewWrapper className="block-video w-full">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="relative flex w-full justify-center"
          >
            <div
              style={{
                maxWidth: typeof width === 'number' ? width : '100%',
                width: '100%',
              }}
            >
              <div className="relative">
                <ArtPlayer
                  option={{
                    url: videoUrl,
                    muted: false,
                    autoplay: false,
                    lang: locale,
                    pip: true,
                  }}
                  // Do not provide a default subtitle in the editor preview -
                  // subtitles should only be loaded when an actual file exists
                  locale={locale}
                  subtitleEntries={subtitleEntries}
                  className="aspect-video w-full rounded-lg shadow-sm"
                  onPlayerReady={(_art: ArtplayerType) => {}}
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={handleExpand}
                    className="rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
                    title={t('expand')}
                  >
                    <Expand className="h-4 w-4 text-white" />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
                    title={t('download')}
                  >
                    <Download className="h-4 w-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </NodeViewWrapper>
        <Modal
          isDialogOpen={isModalOpen}
          onOpenChange={setIsModalOpen}
          dialogTitle={t('videoPlayer')}
          minWidth="lg"
          minHeight="lg"
          dialogContent={
            <div className="w-full">
              <video
                controls
                autoPlay
                className="aspect-video w-full rounded-lg bg-black object-contain shadow-lg"
                src={videoUrl}
              />
            </div>
          }
        />
      </>
    );
  }

  // If we're in preview mode but don't have a video, show nothing
  if (!(isEditable || (blockObject && videoUrl))) {
    return null;
  }

  // Show the full editor UI when in edit mode
  return (
    <NodeViewWrapper className="block-video w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="bg-muted border-border flex flex-col space-y-4 rounded-lg border px-5 py-6 [transition:all_0.2s_ease]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-zinc-500">
              <Video size={16} />
              <span className="font-medium">{t('title')}</span>
            </div>
            {blockObject ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRemove}
                className="text-zinc-400 transition-colors hover:text-red-500"
                title={t('remove')}
              >
                <X size={16} />
              </motion.button>
            ) : null}
          </div>

          {!(blockObject && videoUrl) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleVideoChange}
                accept={SUPPORTED_FILES}
                className="hidden"
                aria-label={t('ariaLabel')}
                title={t('selectVideoFile')}
              />

              <motion.div
                ref={uploadZoneRef}
                className={cn(
                  'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
                  'hover:bg-blue-500/5 hover:border-blue-500',
                  isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-gray-200 bg-white',
                )}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <AnimatePresence>
                  {isLoading ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
                      <div className="text-sm text-zinc-600">{t('uploading', { progress: uploadProgress })}</div>
                      <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-gray-200">
                        <motion.div
                          className="h-full rounded-full bg-blue-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          transition={{ duration: 0.2 }}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      <Upload className="mx-auto h-8 w-8 text-blue-500" />
                      <div>
                        <div className="text-sm font-medium text-zinc-700">{t('uploadPlaceholder')}</div>
                        <div className="mt-1 text-xs text-zinc-500">{t('uploadHint')}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {error ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-500">
                  <AlertCircle size={16} />
                  {error}
                </div>
              ) : null}
            </motion.div>
          )}

          {blockObject && videoUrl ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-sm font-medium text-zinc-500">
                  <ArrowLeftRight size={14} />
                  {t('sizeLabel')}
                </div>
                {(Object.keys(VIDEO_SIZES) as VideoSize[]).map((size) => (
                  <motion.button
                    key={size}
                    className={sizeButtonCn(selectedSize === size)}
                    onClick={() => {
                      handleSizeChange(size);
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {size === selectedSize && <CheckCircle2 size={14} />}
                    {t(VIDEO_SIZES[size].label)}
                  </motion.button>
                ))}
                <motion.button
                  className={cn(sizeButtonCn(false), 'ml-auto')}
                  onClick={handleDownload}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download size={14} />
                  {t('download')}
                </motion.button>
              </div>

              <div className="flex w-full items-center justify-center">
                <div
                  style={{
                    maxWidth:
                      typeof VIDEO_SIZES[selectedSize].width === 'number' ? VIDEO_SIZES[selectedSize].width : '100%',
                    width: '100%',
                  }}
                >
                  <div className="relative overflow-hidden rounded-lg bg-black/5">
                    {isLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    ) : null}
                    <ArtPlayer
                      option={{
                        url: videoUrl,
                        muted: false,
                        autoplay: false,
                        lang: locale,
                        pip: true,
                      }}
                      // Do not provide a default subtitle in the editor preview -
                      // subtitles should only be loaded when an actual file exists
                      locale={locale}
                      subtitleEntries={subtitleEntries}
                      className={cn(
                        'aspect-video w-full bg-black/95 shadow-sm transition-all duration-200',
                        isLoading && 'opacity-50 blur-sm',
                      )}
                      onPlayerReady={(_art: ArtplayerType) => {}}
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={handleExpand}
                        className="rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
                        title={t('expand')}
                      >
                        <Expand className="h-4 w-4 text-white" />
                      </button>
                      <button
                        onClick={handleDownload}
                        className="rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
                        title={t('download')}
                      >
                        <Download className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </div>
        {blockObject && videoUrl ? (
          <Modal
            isDialogOpen={isModalOpen}
            onOpenChange={setIsModalOpen}
            dialogTitle={t('videoPlayer')}
            minWidth="lg"
            minHeight="lg"
            dialogContent={
              <div className="w-full">
                <video
                  controls
                  autoPlay
                  className="aspect-video w-full rounded-lg bg-black object-contain shadow-lg"
                  src={videoUrl}
                  title={t('videoPlayer')}
                />
              </div>
            }
          />
        ) : null}
      </motion.div>
    </NodeViewWrapper>
  );
};

export default VideoBlockComponent;
