import { FileUploadBlock, FileUploadBlockButton, FileUploadBlockInput } from '../../FileUploadBlock';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { AlertTriangle, Download, Expand, FileText } from 'lucide-react';
import { getActivityBlockMediaDirectory } from '@services/media/media';
import { useCourse } from '@components/Contexts/CourseContext';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { uploadNewPDFFile } from '@services/blocks/Pdf/pdf';
import { constructAcceptValue } from '@/lib/constants';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';

const SUPPORTED_FILES = constructAcceptValue(['pdf']);
const DEFAULT_SIZE = { width: 720, height: 540 };
const MIN_WIDTH = 320;
const MAX_WIDTH = 1400;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 1200;

interface PdfBlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
}

interface PdfBlockSize {
  width: number;
  height: number;
}

interface PdfNodeAttrs {
  blockObject: PdfBlockObject | null;
  size?: PdfBlockSize;
}

interface PdfExtensionOptions {
  activity: { activity_uuid: string };
}

function normalizeSize(size?: Partial<PdfBlockSize> | null): PdfBlockSize {
  return {
    width: typeof size?.width === 'number' && size.width > 0 ? size.width : DEFAULT_SIZE.width,
    height: typeof size?.height === 'number' && size.height > 0 ? size.height : DEFAULT_SIZE.height,
  };
}

const PDFBlockComponent = (props: TypedNodeViewProps<PdfNodeAttrs, PdfExtensionOptions>) => {
  const t = useTranslations('DashPage.Editor.PDFBlock');
  const course = useCourse();
  const [pdf, setPDF] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockObject, setblockObject] = useState(props.node.attrs.blockObject);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [size, setSize] = useState(() => normalizeSize(props.node.attrs.size));
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const nodeSize = props.node.attrs.size;
  const fileId = blockObject ? `${blockObject.content.file_id}.${blockObject.content.file_format}` : null;
  const editorState = useEditorProvider();
  const { isEditable } = editorState;
  const sizeRef = useRef(size);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widthPanelRef = useRef<PanelImperativeHandle | null>(null);
  const heightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isSyncingPanelsRef = useRef(false);
  const syncPanelsRafRef = useRef<number | null>(null);

  useEffect(() => {
    const nextSize = normalizeSize(nodeSize);
    sizeRef.current = nextSize;
    setSize(nextSize);
  }, [nodeSize]);

  useEffect(() => {
    setblockObject(props.node.attrs.blockObject);
  }, [props.node.attrs.blockObject]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateAvailableWidth = () => {
      const nextWidth = Math.round(containerRef.current?.getBoundingClientRect().width ?? 0);
      setAvailableWidth(nextWidth > 0 ? nextWidth : null);
    };

    updateAvailableWidth();
    const resizeObserver = new ResizeObserver(updateAvailableWidth);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  const updateLocalSize = useCallback((updater: (current: PdfBlockSize) => PdfBlockSize) => {
    setSize((current) => {
      const next = updater(current);
      sizeRef.current = next;
      return next;
    });
  }, []);

  const persistSize = useCallback(() => {
    if (isSyncingPanelsRef.current) return;
    props.updateAttributes({ size: sizeRef.current });
  }, [props]);

  const handlePDFChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPDF(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async () => {
    if (!pdf) return; // Guard: only proceed if pdf is not null
    setIsLoading(true);
    const object = await uploadNewPDFFile(pdf, props.extension.options.activity.activity_uuid);
    setIsLoading(false);
    setblockObject(object);
    props.updateAttributes({
      blockObject: object,
    });
  };

  const handleDownload = () => {
    if (!(fileId && blockObject)) return;

    const pdfUrl = getActivityBlockMediaDirectory({
      courseId: course?.courseStructure.course_uuid || '',
      activityId: props.extension.options.activity.activity_uuid,
      blockId: blockObject.block_uuid,
      fileId,
      type: 'pdfBlock',
    });

    const link = document.createElement('a');
    link.href = pdfUrl || '';
    link.download = `document-${blockObject?.block_uuid || 'download'}.${blockObject?.content.file_format || 'pdf'}`;
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

  const handleWidthResize = useCallback(
    (panelSize: PanelSize) => {
      if (isSyncingPanelsRef.current) return;
      updateLocalSize((current) => ({
        ...current,
        width: Math.round(panelSize.inPixels),
      }));
    },
    [updateLocalSize],
  );

  const handleHeightResize = useCallback(
    (panelSize: PanelSize) => {
      if (isSyncingPanelsRef.current) return;
      updateLocalSize((current) => ({
        ...current,
        height: Math.round(panelSize.inPixels),
      }));
    },
    [updateLocalSize],
  );

  const maxVisibleWidth = availableWidth ? Math.min(MAX_WIDTH, availableWidth) : MAX_WIDTH;
  const visibleWidth = Math.min(size.width, maxVisibleWidth);
  const visibleHeight = Math.min(size.height, MAX_HEIGHT);
  const minVisibleWidth = Math.min(MIN_WIDTH, maxVisibleWidth);
  const targetWidth = Math.min(normalizeSize(nodeSize).width, maxVisibleWidth);
  const targetHeight = Math.min(normalizeSize(nodeSize).height, MAX_HEIGHT);

  useEffect(() => {
    if (!widthPanelRef.current || !heightPanelRef.current) return;

    isSyncingPanelsRef.current = true;
    widthPanelRef.current.resize(targetWidth);
    heightPanelRef.current.resize(targetHeight);

    if (syncPanelsRafRef.current !== null) {
      cancelAnimationFrame(syncPanelsRafRef.current);
    }

    syncPanelsRafRef.current = requestAnimationFrame(() => {
      isSyncingPanelsRef.current = false;
      syncPanelsRafRef.current = null;
    });

    return () => {
      if (syncPanelsRafRef.current !== null) {
        cancelAnimationFrame(syncPanelsRafRef.current);
        syncPanelsRafRef.current = null;
      }
      isSyncingPanelsRef.current = false;
    };
  }, [targetHeight, targetWidth]);

  const pdfUrl = blockObject
    ? getActivityBlockMediaDirectory({
        courseId: course?.courseStructure.course_uuid || '',
        activityId: props.extension.options.activity.activity_uuid,
        blockId: blockObject.block_uuid,
        fileId: fileId || '',
        type: 'pdfBlock',
      })
    : null;

  const viewerStyle = {
    width: `${visibleWidth}px`,
    height: `${visibleHeight}px`,
  };

  return (
    <>
      <NodeViewWrapper className="block-pdf w-full py-2">
        <FileUploadBlock
          isEditable={isEditable}
          isLoading={isLoading}
          isEmpty={!blockObject}
          Icon={FileText}
        >
          <FileUploadBlockInput
            onChange={handlePDFChange}
            accept={SUPPORTED_FILES}
          />
          <FileUploadBlockButton
            onClick={handleSubmit}
            disabled={!pdf}
          />
        </FileUploadBlock>
        {blockObject ? (
          <div
            ref={containerRef}
            className="flex w-full flex-col"
          >
            <div
              className="group relative mx-auto max-w-full overflow-hidden rounded-lg border bg-black shadow-sm"
              style={viewerStyle}
            >
              <ResizablePanelGroup
                orientation="horizontal"
                className="absolute inset-0"
                onLayoutChanged={persistSize}
                style={{ width: `${Math.max(maxVisibleWidth, visibleWidth)}px` }}
              >
                <ResizablePanel
                  id="pdf-width-panel"
                  panelRef={widthPanelRef}
                  defaultSize={visibleWidth}
                  minSize={minVisibleWidth}
                  maxSize={maxVisibleWidth}
                  groupResizeBehavior="preserve-pixel-size"
                  onResize={handleWidthResize}
                >
                  <ResizablePanelGroup
                    orientation="vertical"
                    className="h-full"
                    onLayoutChanged={persistSize}
                    style={{ height: `${MAX_HEIGHT}px` }}
                  >
                    <ResizablePanel
                      id="pdf-height-panel"
                      panelRef={heightPanelRef}
                      defaultSize={visibleHeight}
                      minSize={MIN_HEIGHT}
                      maxSize={MAX_HEIGHT}
                      groupResizeBehavior="preserve-pixel-size"
                      onResize={handleHeightResize}
                    >
                      <iframe
                        className="h-full w-full rounded-lg bg-black shadow-sm"
                        src={pdfUrl || ''}
                        title={t('pdfViewer')}
                      />
                    </ResizablePanel>
                    {isEditable && (
                      <ResizableHandle
                        withHandle
                        className="bg-white/70 hover:bg-white/90"
                      />
                    )}
                    <ResizablePanel minSize={0} />
                  </ResizablePanelGroup>
                </ResizablePanel>
                {isEditable && maxVisibleWidth > minVisibleWidth && (
                  <ResizableHandle
                    withHandle
                    className="bg-white/70 hover:bg-white/90"
                  />
                )}
                <ResizablePanel minSize={0} />
              </ResizablePanelGroup>
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  type="button"
                  onClick={handleExpand}
                  className="rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
                  title={t('expand')}
                >
                  <Expand className="h-4 w-4 text-white" />
                </button>
                {!isEditable && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="rounded-full bg-black/50 p-2 transition-colors hover:bg-black/70"
                    title={t('download')}
                  >
                    <Download className="h-4 w-4 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {isLoading ? (
          <div>
            <AlertTriangle
              color="#e1e0e0"
              size={50}
            />
          </div>
        ) : null}
      </NodeViewWrapper>
      {blockObject && pdfUrl ? (
        <Modal
          isDialogOpen={isModalOpen}
          onOpenChange={setIsModalOpen}
          dialogTitle={t('pdfDocument')}
          minWidth="xl"
          minHeight="xl"
          dialogContent={
            <div className="h-[80vh] w-full">
              <iframe
                className="h-full w-full rounded-lg border shadow-lg"
                src={pdfUrl}
                title={t('pdfDocument')}
              />
            </div>
          }
        />
      ) : null}
    </>
  );
};

export default PDFBlockComponent;
