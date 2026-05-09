import {
  AlertCircle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  Expand,
  GripHorizontal,
  ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import NextImage from '@components/ui/NextImage';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';

import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { getActivityBlockMediaDirectory } from '@services/media/media';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { uploadNewImageFile } from '@services/blocks/Image/images';
import { useCourse } from '@components/Contexts/CourseContext';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { constructAcceptValue } from '@/lib/constants';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type Alignment = 'left' | 'center' | 'right';

interface BlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
}

interface ImageBlockProps {
  node: {
    attrs: {
      blockObject?: BlockObject | null;
      size?: { width: number };
      alignment?: Alignment;
    };
  };
  updateAttributes: (attrs: Partial<ImageBlockProps['node']['attrs']>) => void;
  extension: {
    options: {
      activity: { activity_uuid: string };
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

const SUPPORTED_FILES = constructAcceptValue(['jpg', 'png', 'webp', 'gif', 'avif']);
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 150;
const MAX_WIDTH = 1200;

const ALIGNMENT_CONFIG = {
  left: { class: 'mr-auto', icon: AlignLeft },
  center: { class: 'mx-auto', icon: AlignCenter },
  right: { class: 'ml-auto', icon: AlignRight },
} as const;

// ============================================================================
// Hooks
// ============================================================================

interface UseImageUploadOptions {
  activityUuid: string;
  onSuccess: (blockObject: BlockObject) => void;
  t: ReturnType<typeof useTranslations>;
}

function useImageUpload({ activityUuid, onSuccess, t }: UseImageUploadOptions) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      setError(null);

      if (!selectedFile) {
        setFile(null);
        setPreview(null);
        return;
      }

      // Validate file type
      if (!selectedFile.type.startsWith('image/')) {
        setError(t('invalidImageFile'));
        return;
      }

      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    },
    [t],
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await uploadNewImageFile(file, activityUuid);
      onSuccess(result);
      setFile(null);
      setPreview(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  }, [file, activityUuid, onSuccess, t]);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
  }, []);

  return {
    file,
    preview,
    isUploading,
    error,
    handleFileSelect,
    handleUpload,
    reset,
  };
}

function useImageResize(initialWidth: number, onResize: (width: number) => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = 'touches' in e ? (e.touches?.[0]?.clientX ?? 0) : e.clientX;
      const startWidth = width;

      const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
        const currentX = 'touches' in moveEvent ? (moveEvent.touches?.[0]?.clientX ?? startX) : moveEvent.clientX;
        const delta = currentX - startX;
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta * 2)); // *2 because handle is centered
        setWidth(newWidth);
      };

      const handleEnd = () => {
        setIsResizing(false);
        onResize(width);
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove);
      document.addEventListener('touchend', handleEnd);
    },
    [width, onResize],
  );

  return { containerRef, width, isResizing, handleResizeStart, setWidth };
}

// ============================================================================
// Sub-components
// ============================================================================

interface IconButtonProps {
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  isActive?: boolean;
  variant?: 'default' | 'overlay';
  className?: string;
}

function IconButton({ onClick, icon: Icon, title, isActive, variant = 'default', className }: IconButtonProps) {
  const baseStyles = 'rounded-md p-1.5 transition-colors';
  const variants = {
    default: cn('text-gray-600 hover:bg-gray-100 hover:text-gray-900', isActive && 'bg-gray-100 text-gray-900'),
    overlay: 'bg-black/50 text-white hover:bg-black/70 rounded-full p-2 backdrop-blur-sm',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(baseStyles, variants[variant], className)}
      title={title}
    >
      <Icon size={16} />
    </button>
  );
}

interface DropZoneProps {
  onFileSelect: (file: File | null) => void;
  preview: string | null;
  isUploading: boolean;
  error: string | null;
  onUpload: () => void;
  onReset: () => void;
  t: ReturnType<typeof useTranslations>;
}

function DropZone({ onFileSelect, preview, isUploading, error, onUpload, onReset, t }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  if (preview) {
    return (
      <div className="relative rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="mx-auto h-48 w-full overflow-hidden rounded-md">
          <NextImage
            src={preview}
            alt={t('previewImageAlt')}
            fill
            className="object-contain"
            sizes="100vw"
          />
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={isUploading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={isUploading}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                />
                {t('uploading')}
              </>
            ) : (
              <>
                <Upload size={16} />
                {t('upload')}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
        isDragOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100',
        error && 'border-red-300 bg-red-50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={SUPPORTED_FILES}
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
        className="hidden"
      />

      <div className={cn('mb-3 rounded-full p-3', error ? 'bg-red-100' : 'bg-gray-100')}>
        {error ? <AlertCircle className="h-6 w-6 text-red-500" /> : <ImageIcon className="h-6 w-6 text-gray-400" />}
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">{t('dropOrClick')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('supportedFormats')}</p>
        </>
      )}
    </div>
  );
}

interface ImageToolbarProps {
  alignment: Alignment;
  onAlignmentChange: (alignment: Alignment) => void;
  onExpand: () => void;
  t: ReturnType<typeof useTranslations>;
}

function ImageToolbar({ alignment, onAlignmentChange, onExpand, t }: ImageToolbarProps) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-white/95 p-1 opacity-0 shadow-lg backdrop-blur-sm transition-opacity group-hover:opacity-100">
      {(Object.keys(ALIGNMENT_CONFIG) as Alignment[]).map((align) => {
        const config = ALIGNMENT_CONFIG[align];
        return (
          <IconButton
            key={align}
            onClick={() => onAlignmentChange(align)}
            icon={config.icon}
            title={t(`align${align.charAt(0).toUpperCase() + align.slice(1)}`)}
            isActive={alignment === align}
          />
        );
      })}
      <div className="mx-1 h-4 w-px bg-gray-200" />
      <IconButton
        onClick={onExpand}
        icon={Expand}
        title={t('expand')}
      />
    </div>
  );
}

interface ResizeHandleProps {
  onResizeStart: (e: React.MouseEvent | React.TouchEvent) => void;
  isResizing: boolean;
}

function ResizeHandle({ onResizeStart, isResizing }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onResizeStart}
      onTouchStart={onResizeStart}
      className={cn(
        'absolute right-0 top-1/2 z-10 flex h-12 w-4 -translate-y-1/2 translate-x-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white opacity-0 shadow-md transition-opacity group-hover:opacity-100',
        isResizing && 'opacity-100 ring-2 ring-blue-400',
      )}
    >
      <GripHorizontal
        size={12}
        className="text-gray-400"
      />
    </div>
  );
}

interface ViewerControlsProps {
  onExpand: () => void;
  onDownload: () => void;
  t: ReturnType<typeof useTranslations>;
}

function ViewerControls({ onExpand, onDownload, t }: ViewerControlsProps) {
  return (
    <div className="absolute top-2 right-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
      <IconButton
        onClick={onExpand}
        icon={Expand}
        title={t('expand')}
        variant="overlay"
      />
      <IconButton
        onClick={onDownload}
        icon={Download}
        title={t('download')}
        variant="overlay"
      />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ImageBlockComponent({ node, updateAttributes, extension }: ImageBlockProps) {
  const t = useTranslations('DashPage.Editor.ImageBlock');
  usePlatform();
  const course = useCourse();
  const { isEditable } = useEditorProvider();
  const [blockObject, setBlockObject] = useState(node.attrs.blockObject);
  const [alignment, setAlignment] = useState<Alignment>(node.attrs.alignment || 'center');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const activityUuid = extension.options.activity.activity_uuid;
  const initialWidth = node.attrs.size?.width && node.attrs.size.width > 0 ? node.attrs.size.width : DEFAULT_WIDTH;

  // Image URL computation
  const imageUrl = useMemo(() => {
    if (!blockObject || !course) return null;

    const fileId = `${blockObject.content.file_id}.${blockObject.content.file_format}`;
    return getActivityBlockMediaDirectory({
      courseId: course.courseStructure.course_uuid,
      activityId: activityUuid,
      blockId: blockObject.block_uuid,
      fileId,
      type: 'imageBlock',
    });
  }, [blockObject, course, activityUuid]);

  // Upload handling
  const { file, preview, isUploading, error, handleFileSelect, handleUpload, reset } = useImageUpload({
    activityUuid,
    onSuccess: (newBlockObject) => {
      setBlockObject(newBlockObject);
      updateAttributes({ blockObject: newBlockObject });
    },
    t,
  });

  // Resize handling
  const handleResize = useCallback(
    (newWidth: number) => {
      updateAttributes({ size: { width: newWidth } });
    },
    [updateAttributes],
  );

  const { width, isResizing, handleResizeStart } = useImageResize(initialWidth, handleResize);

  // Alignment change
  const handleAlignmentChange = useCallback(
    (newAlignment: Alignment) => {
      setAlignment(newAlignment);
      updateAttributes({ alignment: newAlignment });
    },
    [updateAttributes],
  );

  // Download handler
  const handleDownload = useCallback(() => {
    if (!imageUrl || !blockObject) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `image-${blockObject.block_uuid}.${blockObject.content.file_format}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  }, [imageUrl, blockObject]);

  const alignmentClass = ALIGNMENT_CONFIG[alignment].class;

  return (
    <>
      <NodeViewWrapper className="image-block w-full py-2">
        {/* Upload State */}
        {!blockObject && isEditable && (
          <DropZone
            onFileSelect={handleFileSelect}
            preview={preview}
            isUploading={isUploading}
            error={error}
            onUpload={handleUpload}
            onReset={reset}
            t={t}
          />
        )}

        {/* Edit Mode */}
        {blockObject && imageUrl && isEditable && (
          <div
            className={cn('group relative', alignmentClass)}
            style={{ width }}
          >
            <img
              src={imageUrl}
              alt=""
              className={cn(
                'h-auto w-full rounded-lg shadow-sm transition-shadow',
                isResizing && 'ring-2 ring-blue-400',
              )}
              draggable={false}
            />
            <ImageToolbar
              alignment={alignment}
              onAlignmentChange={handleAlignmentChange}
              onExpand={() => setIsModalOpen(true)}
              t={t}
            />
            <ResizeHandle
              onResizeStart={handleResizeStart}
              isResizing={isResizing}
            />
          </div>
        )}

        {/* View Mode */}
        {blockObject && imageUrl && !isEditable && (
          <div
            className={cn('group relative', alignmentClass)}
            style={{ width }}
          >
            <img
              src={imageUrl}
              alt=""
              className="h-auto w-full rounded-lg shadow-sm"
            />
            <ViewerControls
              onExpand={() => setIsModalOpen(true)}
              onDownload={handleDownload}
              t={t}
            />
          </div>
        )}
      </NodeViewWrapper>

      {/* Modal */}
      {blockObject && imageUrl && (
        <Modal
          isDialogOpen={isModalOpen}
          onOpenChange={setIsModalOpen}
          dialogTitle={t('imageViewer')}
          minWidth="lg"
          minHeight="lg"
          dialogContent={
            <div className="flex items-center justify-center p-4">
              <img
                src={imageUrl}
                alt=""
                className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-lg"
              />
            </div>
          }
        />
      )}
    </>
  );
}
