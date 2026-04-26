'use client';
import {
  getLogoMediaDirectory,
  getPlatformThumbnailImage,
  getPreviewMediaDirectory,
  getThumbnailMediaDirectory,
} from '@services/media/media';
import {
  updatePlatform,
  uploadPlatformLogo,
  uploadPlatformPreview,
  uploadPlatformThumbnail,
} from '@/services/settings/platform';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@components/ui/dialog';
import { GripVertical, ImageIcon, Images, Info, Plus, StarIcon, UploadCloud, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { SiLoom, SiYoutube } from '@icons-pack/react-simple-icons';
import { constructAcceptValue } from '@/lib/constants';
import type { ChangeEvent, MouseEvent } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import NextImage from '@components/ui/NextImage';
import { useState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const SUPPORTED_FILES = constructAcceptValue(['png', 'jpg', 'webp', 'avif']);

interface Preview {
  id: string;
  url: string;
  type: 'image' | 'youtube' | 'loom';
  filename?: string;
  thumbnailUrl?: string;
  order: number;
}

// Update the height constant
const PREVIEW_HEIGHT = 'h-28'; // Reduced height

// Add this type for the video service selection
type VideoService = 'youtube' | 'loom' | null;

// Add this constant for consistent sizing
const DIALOG_ICON_SIZE = 'w-16 h-16';

// Function to get translated preview options
const getAddPreviewOptions = (t: Function, isPreviewUploading: boolean, setSelectedService: Function) => [
  {
    id: 'image',
    title: t('Dialog.AddPreview.imageTitle'),
    description: t('Dialog.AddPreview.imageDescription'),
    icon: UploadCloud,
    color: 'blue',
    onClick: () => document.getElementById('previewInput')?.click(),
    disabled: isPreviewUploading,
  },
  {
    id: 'youtube',
    title: t('Dialog.AddPreview.youtubeTitle'),
    description: t('Dialog.AddPreview.youtubeDescription'),
    icon: SiYoutube,
    color: 'red',
    onClick: () => setSelectedService('youtube'),
    disabled: false,
  },
  {
    id: 'loom',
    title: t('Dialog.AddPreview.loomTitle'),
    description: t('Dialog.AddPreview.loomDescription'),
    icon: SiLoom,
    color: 'blue',
    onClick: () => setSelectedService('loom'),
    disabled: false,
  },
];

export default function EditImages() {
  const router = useRouter();
  const platform = usePlatform() as any;
  const tNotify = useTranslations('DashPage.Notifications');
  const t = useTranslations('DashPage.PlatformSettings.Images');
  const [localLogo, setLocalLogo] = useState<string | null>(null);
  const [localThumbnail, setLocalThumbnail] = useState<string | null>(null);
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);
  const [_isPending, startTransition] = useTransition();
  const [previews, setPreviews] = useState<Preview[]>(() => {
    // Initialize with image previews
    const imagePreviews = (platform?.previews?.images || [])
      .filter((item: any) => item?.filename) // Filter out empty filenames
      .map((item: any, index: number) => ({
        id: item.filename,
        url: getThumbnailMediaDirectory(item.filename),
        filename: item.filename,
        type: 'image' as const,
        order: item.order ?? index, // Use existing order or fallback to index
      }));

    // Initialize with video previews
    const videoPreviews = (platform?.previews?.videos || [])
      .filter((video: any) => video?.id)
      .map((video: any, index: number) => ({
        id: video.id,
        url: video.url,
        type: video.type as 'youtube' | 'loom',
        thumbnailUrl: video.type === 'youtube' ? `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg` : '',
        filename: '',
        order: video.order ?? imagePreviews.length + index, // Use existing order or fallback to index after images
      }));

    const allPreviews = [...imagePreviews, ...videoPreviews];
    return allPreviews.toSorted((a, b) => a.order - b.order);
  });
  const [isPreviewUploading, setIsPreviewUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<VideoService>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      if (file) {
        setLocalLogo(URL.createObjectURL(file));
        startTransition(() => setIsLogoUploading(true));
        const loadingToast = toast.loading(tNotify('uploadingLogo'));
        try {
          await uploadPlatformLogo(file);
          await new Promise((r) => setTimeout(r, 1500));
          toast.success(tNotify('logoUpdatedSuccess'), { id: loadingToast });
          router.refresh();
        } catch {
          toast.error(tNotify('logoUploadFailed'), { id: loadingToast });
        } finally {
          startTransition(() => setIsLogoUploading(false));
        }
      }
    }
  };

  const handleThumbnailChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      if (file) {
        setLocalThumbnail(URL.createObjectURL(file));
        startTransition(() => setIsThumbnailUploading(true));
        const loadingToast = toast.loading(tNotify('uploadingThumbnail'));
        try {
          await uploadPlatformThumbnail(file);
          await new Promise((r) => setTimeout(r, 1500));
          toast.success(tNotify('thumbnailUpdatedSuccess'), { id: loadingToast });
          router.refresh();
        } catch {
          toast.error(tNotify('thumbnailUploadFailed'), { id: loadingToast });
        } finally {
          startTransition(() => setIsThumbnailUploading(false));
        }
      }
    }
  };

  const handleImageButtonClick = (inputId: string) => (event: MouseEvent) => {
    event.preventDefault();
    document.getElementById(inputId)?.click();
  };

  const handlePreviewUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const files = [...event.target.files];
      const remainingSlots = 4 - previews.length;

      if (files.length > remainingSlots) {
        toast.error(t('Errors.maxPreviewsError', { count: remainingSlots }));
        return;
      }

      startTransition(() => setIsPreviewUploading(true));
      const loadingToast = toast.loading(tNotify('uploadingPreviews', { count: files.length }));

      try {
        const uploadPromises = files.map(async (file) => {
          const response = await uploadPlatformPreview(file);
          return {
            id: response.name_in_disk,
            url: URL.createObjectURL(file),
            filename: response.name_in_disk,
            type: 'image' as const,
            order: previews.length, // Add new items at the end
          };
        });

        const newPreviews = await Promise.all(uploadPromises);
        const updatedPreviews = [...previews, ...newPreviews];

        await updatePlatform({
          previews: {
            images: updatedPreviews
              .filter((p) => p.type === 'image')
              .map((p) => ({
                filename: p.filename,
                order: p.order,
              })),
            videos: updatedPreviews
              .filter((p) => p.type === 'youtube' || p.type === 'loom')
              .map((p) => ({
                type: p.type,
                url: p.url,
                id: p.id,
                order: p.order,
              })),
          },
        });

        setPreviews(updatedPreviews);
        toast.success(tNotify('previewsAddedSuccess', { count: files.length }), {
          id: loadingToast,
        });
        router.refresh();
      } catch {
        toast.error(tNotify('previewsUploadFailed'), { id: loadingToast });
      } finally {
        startTransition(() => setIsPreviewUploading(false));
      }
    }
  };

  const removePreview = async (id: string) => {
    const loadingToast = toast.loading(tNotify('removingPreview'));
    try {
      const updatedPreviews = previews.filter((p) => p.id !== id);
      const updatedPreviewFilenames = updatedPreviews.map((p) => p.filename);

      await updatePlatform({
        previews: {
          images: updatedPreviewFilenames,
        },
      });

      startTransition(() => setPreviews(updatedPreviews));
      toast.success(tNotify('previewRemovedSuccess'), { id: loadingToast });
      router.refresh();
    } catch {
      toast.error(tNotify('previewRemoveFailed'), { id: loadingToast });
    }
  };

  const extractVideoId = (url: string, type: 'youtube' | 'loom'): string | null => {
    if (type === 'youtube') {
      const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/;
      const match = regex.exec(url);
      return match ? match[1] || null : null;
    }
    if (type === 'loom') {
      const regex = /loom\.com\/(?:share|embed)\/([\dA-Za-z]+)/;
      const match = regex.exec(url);
      return match ? match[1] || null : null;
    }
    return null;
  };

  const handleVideoSubmit = async (type: 'youtube' | 'loom') => {
    const videoId = extractVideoId(videoUrl, type);
    if (!videoId) {
      toast.error(
        t('Errors.invalidVideoUrl', {
          type: t(`Dialog.AddPreview.${type}Title`),
        }),
      );
      return;
    }

    // Check if video already exists
    if (previews.some((preview) => preview.id === videoId)) {
      toast.error(t('Errors.videoAlreadyAddedError'));
      return;
    }

    const loadingToast = toast.loading(tNotify('addingVideoPreview'));

    try {
      const thumbnailUrl = type === 'youtube' ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '';

      const newPreview: Preview = {
        id: videoId,
        url: videoUrl,
        type,
        thumbnailUrl,
        filename: '',
        order: previews.length, // Add new items at the end
      };

      const updatedPreviews = [...previews, newPreview];

      await updatePlatform({
        previews: {
          images: updatedPreviews
            .filter((p) => p.type === 'image')
            .map((p) => ({
              filename: p.filename,
              order: p.order,
            })),
          videos: updatedPreviews
            .filter((p) => p.type === 'youtube' || p.type === 'loom')
            .map((p) => ({
              type: p.type,
              url: p.url,
              id: p.id,
              order: p.order,
            })),
        },
      });

      setPreviews(updatedPreviews);
      setVideoUrl('');
      setVideoDialogOpen(false);
      toast.success(tNotify('videoPreviewAddedSuccess'), { id: loadingToast });
      router.refresh();
    } catch {
      toast.error(tNotify('videoPreviewAddFailed'), { id: loadingToast });
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = [...previews];
    const [reorderedItem] = items.splice(result.source.index, 1);
    if (reorderedItem) {
      items.splice(result.destination.index, 0, reorderedItem);
    }

    // Update order numbers
    const reorderedItems = items.map((item, index) => Object.assign(item, { order: index }));

    setPreviews(reorderedItems);

    // Update the order in the backend
    const loadingToast = toast.loading(tNotify('updatingPreviewOrder'));
    try {
      await updatePlatform({
        previews: {
          images: reorderedItems
            .filter((p) => p.type === 'image')
            .map((p) => ({
              filename: p.filename,
              order: p.order,
            })),
          videos: reorderedItems
            .filter((p) => p.type === 'youtube' || p.type === 'loom')
            .map((p) => ({
              type: p.type,
              url: p.url,
              id: p.id,
              order: p.order,
            })),
        },
      });

      toast.success(tNotify('previewOrderUpdatedSuccess'), {
        id: loadingToast,
      });
      router.refresh();
    } catch {
      toast.error(tNotify('previewOrderUpdateFailed'), { id: loadingToast });
      setPreviews(previews);
    }
  };

  // Add function to reset video dialog state
  const resetVideoDialog = () => {
    setSelectedService(null);
    setVideoUrl('');
  };

  return (
    <div className="bg-background mx-0 mb-16 rounded-3xl sm:mx-10 sm:mb-0">
      <div className="bg-muted/30 mb-2 flex flex-col gap-1 rounded-3xl px-5 py-5">
        <h1 className="text-foreground text-xl font-bold">{t('title')}</h1>
        <h2 className="text-muted-foreground text-base">{t('description')}</h2>
      </div>
      <Tabs
        defaultValue="logo"
        className="w-full"
      >
        <TabsList className="bg-muted grid w-full grid-cols-3 rounded-lg p-1">
          <TabsTrigger
            value="logo"
            className="data-[state=active]:bg-background flex items-center gap-2 transition-all data-[state=active]:shadow-xs"
          >
            <StarIcon size={16} />
            <span>{t('Tabs.logo')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="thumbnail"
            className="data-[state=active]:bg-background flex items-center gap-2 transition-all data-[state=active]:shadow-xs"
          >
            <ImageIcon size={16} />
            <span>{t('Tabs.thumbnail')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="previews"
            className="data-[state=active]:bg-background flex items-center gap-2 transition-all data-[state=active]:shadow-xs"
          >
            <Images size={16} />
            <span>{t('Tabs.previews')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="logo"
          className="mt-2"
        >
          <div className="flex w-full flex-col space-y-5">
            <div className="bg-muted/20 w-full rounded-3xl py-8 transition-all duration-300">
              <div className="flex flex-col items-center justify-center gap-8">
                <div className="group relative h-[125px] w-[250px]">
                  <NextImage
                    src={
                      platform?.logo_image
                        ? localLogo || getLogoMediaDirectory(platform?.logo_image)
                        : '/empty_thumbnail.avif'
                    }
                    alt="Лого организации"
                    fill
                    className={cn(
                      'rounded-lg bg-background object-contain shadow-md',
                      'border-2 border-border transition-all duration-300 hover:border-primary/40',
                      isLogoUploading && 'opacity-50',
                    )}
                    sizes="100vw"
                  />
                </div>

                <div className="flex flex-col items-center space-y-4">
                  <input
                    type="file"
                    id="fileInput"
                    accept={SUPPORTED_FILES}
                    className="hidden"
                    onChange={handleFileChange}
                    aria-label={t('Buttons.ariaLabelLogo')}
                    title={t('Buttons.selectLogoFile')}
                  />
                  <button
                    type="button"
                    disabled={isLogoUploading}
                    className={cn(
                      'rounded-full px-6 py-2.5 font-medium text-sm',
                      'bg-primary text-primary-foreground',
                      'hover:bg-primary/90',
                      'shadow-xs transition-all duration-300 hover:shadow-sm',
                      'flex items-center space-x-2',
                      isLogoUploading && 'cursor-not-allowed opacity-75',
                    )}
                    onClick={handleImageButtonClick('fileInput')}
                  >
                    <UploadCloud
                      size={18}
                      className={cn('', isLogoUploading && 'animate-bounce')}
                    />
                    <span>{isLogoUploading ? t('Buttons.uploadingLogo') : t('Buttons.uploadNewLogo')}</span>
                  </button>

                  <div className="flex flex-col items-center space-y-2 text-xs text-gray-500">
                    <div className="flex items-center space-x-2 rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">
                      <Info size={14} />
                      <p className="font-medium">{t('Info.acceptedFormats')}</p>
                    </div>
                    <p className="text-gray-400">{t('Info.recommendedSizeLogo')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="thumbnail"
          className="mt-2"
        >
          <div className="flex w-full flex-col space-y-5">
            <div className="bg-muted/20 w-full rounded-3xl py-8 transition-all duration-300">
              <div className="flex flex-col items-center justify-center space-y-8">
                <div className="group relative h-[125px] w-[250px]">
                  <NextImage
                    src={
                      platform?.thumbnail_image
                        ? localThumbnail || getPlatformThumbnailImage(platform.thumbnail_image)
                        : '/empty_thumbnail.avif'
                    }
                    alt="Platform thumbnail"
                    fill
                    className={cn(
                      'rounded-lg bg-white object-contain shadow-md',
                      'border-2 border-gray-100 transition-all duration-300 hover:border-purple-200',
                      isThumbnailUploading && 'opacity-50',
                    )}
                  />
                </div>

                <div className="flex flex-col items-center space-y-4">
                  <input
                    type="file"
                    id="thumbnailInput"
                    accept={SUPPORTED_FILES}
                    className="hidden"
                    onChange={handleThumbnailChange}
                    aria-label={t('Buttons.ariaLabelThumbnail')}
                    title={t('Buttons.selectThumbnailFile')}
                  />
                  <button
                    type="button"
                    disabled={isThumbnailUploading}
                    className={cn(
                      'rounded-full px-6 py-2.5 font-medium text-sm',
                      'bg-primary text-primary-foreground',
                      'hover:bg-primary/90',
                      'shadow-xs transition-all duration-300 hover:shadow-sm',
                      'flex items-center space-x-2',
                      isThumbnailUploading && 'cursor-not-allowed opacity-75',
                    )}
                    onClick={handleImageButtonClick('thumbnailInput')}
                  >
                    <UploadCloud
                      size={18}
                      className={cn('', isThumbnailUploading && 'animate-bounce')}
                    />
                    <span>
                      {isThumbnailUploading ? t('Buttons.uploadingThumbnail') : t('Buttons.uploadNewThumbnail')}
                    </span>
                  </button>

                  <div className="flex flex-col items-center space-y-2 text-xs text-gray-500">
                    <div className="flex items-center space-x-2 rounded-full bg-purple-50 px-3 py-1.5 text-purple-700">
                      <Info size={14} />
                      <p className="font-medium">{t('Info.acceptedFormats')}</p>
                    </div>
                    <p className="text-gray-400">{t('Info.recommendedSizeThumbnail')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="previews"
          className="mt-4"
        >
          <div className="flex w-full flex-col space-y-5">
            <div className="bg-muted/20 w-full rounded-3xl py-6 transition-all duration-300">
              <div className="flex flex-col items-center justify-center space-y-6">
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable
                    droppableId="previews"
                    direction="horizontal"
                  >
                    {(provided) => (
                      <div
                        className={cn(
                          'flex w-full max-w-5xl gap-4 overflow-x-auto p-4 pb-6',
                          previews.length === 0 && 'justify-center',
                        )}
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {previews.map((preview, index) => (
                          <Draggable
                            key={preview.id}
                            draggableId={preview.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  'group relative shrink-0',
                                  'inline-block w-auto',
                                  snapshot.isDragging ? 'z-50 scale-105' : 'hover:scale-102',
                                )}
                              >
                                <button
                                  onClick={() => removePreview(preview.id)}
                                  className={cn(
                                    '-right-2 -top-2 absolute rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600',
                                    'z-10 opacity-0 shadow-xs group-hover:opacity-100',
                                    'transition-opacity duration-200',
                                  )}
                                >
                                  <X size={14} />
                                </button>
                                <div
                                  {...provided.dragHandleProps}
                                  className={cn(
                                    '-left-2 -top-2 absolute rounded-full bg-gray-600 p-1.5 text-white hover:bg-gray-700',
                                    'z-10 cursor-grab opacity-0 shadow-xs active:cursor-grabbing group-hover:opacity-100',
                                    'transition-opacity duration-200',
                                  )}
                                >
                                  <GripVertical size={14} />
                                </div>
                                {preview.type === 'image' ? (
                                  <div
                                    className={cn(
                                      'relative h-28 w-48 rounded-xl bg-white',
                                      snapshot.isDragging ? 'shadow-lg' : 'shadow-xs hover:shadow-md',
                                    )}
                                  >
                                    <NextImage
                                      src={getPreviewMediaDirectory(preview.id)}
                                      alt={`Preview ${preview.id}`}
                                      fill
                                      className="rounded-xl object-contain"
                                      sizes="100vw"
                                    />
                                  </div>
                                ) : (
                                  <div
                                    className={cn(
                                      `w-48 ${PREVIEW_HEIGHT} relative overflow-hidden rounded-xl`,
                                      'border border-gray-200 transition-colors duration-200 hover:border-gray-300',
                                      snapshot.isDragging ? 'shadow-lg' : 'shadow-xs hover:shadow-md',
                                    )}
                                  >
                                    <div
                                      className="absolute inset-0 bg-cover bg-center"
                                      style={{
                                        backgroundImage: `url(${preview.thumbnailUrl})`,
                                      }}
                                    />
                                    <div className="bg-opacity-40 absolute inset-0 flex items-center justify-center bg-black backdrop-blur-[2px]">
                                      {preview.type === 'youtube' ? (
                                        <SiYoutube className="h-10 w-10 text-red-500" />
                                      ) : (
                                        <SiLoom className="h-10 w-10 text-blue-500" />
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {previews.length < 4 && (
                          <div className={cn('w-48 shrink-0', previews.length === 0 && 'm-0')}>
                            <Dialog
                              open={videoDialogOpen}
                              onOpenChange={(open) => {
                                setVideoDialogOpen(open);
                                if (!open) resetVideoDialog();
                              }}
                            >
                              <DialogTrigger
                                render={
                                  <button
                                    className={cn(
                                      `w-full ${PREVIEW_HEIGHT}`,
                                      'rounded-xl border-2 border-gray-200 border-dashed',
                                      'transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/50',
                                      'group flex flex-col items-center justify-center space-y-2',
                                    )}
                                  />
                                }
                              >
                                <div className="rounded-full bg-blue-50 p-2 transition-colors duration-200 group-hover:bg-blue-100">
                                  <Plus
                                    size={20}
                                    className="text-blue-500"
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-600">{t('Buttons.addPreview')}</span>
                              </DialogTrigger>
                              <DialogContent
                                className="sm:max-w-[600px]"
                                aria-describedby={undefined}
                              >
                                <DialogHeader>
                                  <DialogTitle>{t('Dialog.AddPreview.title')}</DialogTitle>
                                </DialogHeader>
                                <div className={cn('p-6', selectedService ? 'space-y-4' : 'grid grid-cols-3 gap-6')}>
                                  {!selectedService ? (
                                    <>
                                      {getAddPreviewOptions(t, isPreviewUploading, setSelectedService).map((option) => (
                                        <button
                                          key={option.id}
                                          onClick={option.onClick}
                                          className={cn(
                                            'aspect-square w-full rounded-2xl border-2 border-dashed',
                                            `hover:border-${option.color}-300 hover:bg-${option.color}-50/50`,
                                            'transition-all duration-200',
                                            'flex flex-col items-center justify-center space-y-4',
                                            option.disabled && 'cursor-not-allowed opacity-50',
                                          )}
                                          disabled={option.disabled}
                                        >
                                          <div
                                            className={cn(
                                              DIALOG_ICON_SIZE,
                                              `rounded-full bg-${option.color}-50`,
                                              'flex items-center justify-center',
                                            )}
                                          >
                                            <option.icon className={`text- h-8 w-8${option.color}-500`} />
                                          </div>
                                          <div className="text-center">
                                            <p className="font-medium text-gray-700">{option.title}</p>
                                            <p className="mt-1 text-sm text-gray-500">{option.description}</p>
                                          </div>
                                        </button>
                                      ))}
                                      <input
                                        type="file"
                                        id="previewInput"
                                        accept={SUPPORTED_FILES}
                                        className="hidden"
                                        onChange={handlePreviewUpload}
                                        multiple
                                        aria-label={t('Buttons.ariaLabelPreview')}
                                        title={t('Buttons.selectPreviewFile')}
                                      />
                                    </>
                                  ) : (
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                          <div
                                            className={cn(
                                              'flex h-10 w-10 items-center justify-center rounded-full',
                                              selectedService === 'youtube' ? 'bg-red-50' : 'bg-blue-50',
                                            )}
                                          >
                                            {selectedService === 'youtube' ? (
                                              <SiYoutube className="h-5 w-5 text-red-500" />
                                            ) : (
                                              <SiLoom className="h-5 w-5 text-blue-500" />
                                            )}
                                          </div>
                                          <div>
                                            <h3 className="font-medium text-gray-900">
                                              {selectedService === 'youtube'
                                                ? t('Dialog.AddVideo.youtubeTitle')
                                                : t('Dialog.AddVideo.loomTitle')}
                                            </h3>
                                            <p className="text-sm text-gray-500">
                                              {selectedService === 'youtube'
                                                ? t('Dialog.AddVideo.youtubeDescription')
                                                : t('Dialog.AddVideo.loomDescription')}
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setSelectedService(null);
                                          }}
                                          className="text-gray-400 transition-colors hover:text-gray-500"
                                        >
                                          <X size={20} />
                                        </button>
                                      </div>

                                      <div className="space-y-3">
                                        <Input
                                          id="videoUrlInput"
                                          placeholder={
                                            selectedService === 'youtube'
                                              ? t('Dialog.AddVideo.youtubePlaceholder')
                                              : t('Dialog.AddVideo.loomPlaceholder')
                                          }
                                          value={videoUrl}
                                          onChange={(e) => {
                                            setVideoUrl(e.target.value);
                                          }}
                                          className="w-full"
                                        />
                                        <Button
                                          onClick={() => handleVideoSubmit(selectedService)}
                                          className={cn(
                                            'w-full',
                                            selectedService === 'youtube'
                                              ? 'bg-red-500 hover:bg-red-600'
                                              : 'bg-blue-500 hover:bg-blue-600',
                                          )}
                                          disabled={!videoUrl}
                                        >
                                          {t('Dialog.AddVideo.addButton')}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                <div className="flex items-center space-x-2 rounded-full bg-gray-50 px-4 py-2 text-gray-600">
                  <Info size={14} />
                  <p className="text-sm">{t('Info.previewInstructions')}</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
