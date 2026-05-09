import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlignCenter, AlignLeft, AlignRight, Edit2, Save, Trash, X } from 'lucide-react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { getUrlPreview } from '@services/courses/activities';
import type { UrlPreviewResponse } from '@services/courses/activities';
import { Checkbox } from '@components/ui/checkbox';
import NextImage from '@components/ui/NextImage';
import { NodeViewWrapper } from '@tiptap/react';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';
import type { WebPreviewAttrs } from './WebPreview';

type WebPreviewProps = TypedNodeViewProps<WebPreviewAttrs> & {
  deleteNode?: () => void;
};

const ALIGNMENTS = [
  { value: 'left', label: <AlignLeft size={16} /> },
  { value: 'center', label: <AlignCenter size={16} /> },
  { value: 'right', label: <AlignRight size={16} /> },
];

const PreviewImage = ({ src, alt }: { src: string; alt: string }) => (
  <div className="relative -mx-6 -mt-6 mb-0 h-40 w-full overflow-hidden rounded-t-xl">
    <NextImage
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes="100vw"
    />
  </div>
);

const FaviconDisplay = ({ favicon, url, faviconAlt }: { favicon?: string; url: string; faviconAlt: string }) => (
  <div className="mt-0 flex items-center border-t border-gray-100 pt-2">
    {favicon ? (
      <div className="relative mr-2 h-[18px] w-[18px] overflow-hidden rounded bg-gray-100">
        <NextImage
          src={favicon}
          alt={faviconAlt}
          fill
          className="object-cover"
        />
      </div>
    ) : null}
    <span className="truncate text-xs text-gray-500">{url}</span>
  </div>
);

const getAlignmentClass = (alignment: string) => {
  if (alignment === 'center') return 'justify-center';
  if (alignment === 'right') return 'justify-end';
  return 'justify-start';
};

function urlPreviewQueryOptions(url: string) {
  return queryOptions({
    queryKey: queryKeys.activities.linkPreview(url),
    queryFn: () => getUrlPreview(url),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
}

const AlignmentControls = ({
  alignment,
  onAlignmentChange,
  alignments,
  t,
}: {
  alignment: string;
  onAlignmentChange: (value: string) => void;
  alignments: typeof ALIGNMENTS;
  t: (key: string, values?: Record<string, string>) => string;
}) => (
  <div className="mt-4 flex flex-col items-center">
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs text-gray-500">{t('align')}:</span>
      {alignments.map((opt) => (
        <button
          key={opt.value}
          aria-pressed={alignment === opt.value}
          onClick={() => {
            onAlignmentChange(opt.value);
          }}
          title={t('alignOption', { value: t(opt.value) })}
          type="button"
          className={`flex items-center justify-center rounded-full border p-1.5 text-gray-600 transition-colors duration-150 focus:ring-2 focus:ring-blue-300 focus:outline-none ${
            alignment === opt.value
              ? 'border-gray-600 bg-gray-600 text-white hover:bg-gray-700'
              : 'border-gray-200 bg-white hover:bg-gray-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// The component logic is intentionally split across helper functions and local state.
// Complexity is managed by breaking large expressions into isolated helpers.

const WebPreviewComponent = ({ node, updateAttributes, deleteNode }: WebPreviewProps) => {
  const t = useTranslations('Components.WebPreview');
  const [inputUrl, setInputUrl] = useState(node.attrs.url || '');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!node.attrs.url);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const editorContext = useEditorProvider();
  const isEditable = editorContext?.isEditable ?? true;

  const previewData = {
    title: node.attrs.title,
    description: node.attrs.description,
    og_image: node.attrs.og_image,
    favicon: node.attrs.favicon,
    og_type: node.attrs.og_type,
    og_url: node.attrs.og_url,
    url: node.attrs.url,
  };
  const previewUrl = previewData.url ?? undefined;

  const alignment = node.attrs.alignment || 'left';
  const hasPreview = Boolean(previewData.title);

  const [buttonLabel, setButtonLabel] = useState(node.attrs.buttonLabel || t('visitSite'));
  const [showButton, setShowButton] = useState(node.attrs.showButton);
  const [openInPopup, setOpenInPopup] = useState(node.attrs.openInPopup);
  const [popupOpen, setPopupOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(!node.attrs.url);
  const shouldAutoFetchPreview = Boolean(node.attrs.url && !hasPreview);
  const previewQuery = useQuery({
    ...urlPreviewQueryOptions(node.attrs.url || ''),
    enabled: shouldAutoFetchPreview,
  });

  const applyPreviewData = useCallback(
    (url: string, data: UrlPreviewResponse) => {
      const hasMinimalMetadata = !(data.title || data.description || data.og_image);

      if (hasMinimalMetadata) {
        toast.error(t('metadataIncomplete'), {
          duration: 4000,
        });
      }

      updateAttributes({ ...data, url });
      setEditing(false);
      setError(null);
    },
    [t, updateAttributes],
  );

  const fetchPreviewMutation = useMutation({
    mutationFn: async (url: string) => queryClient.fetchQuery(urlPreviewQueryOptions(url)),
    onSuccess: (data, url) => {
      if (!data) {
        throw new Error(t('errorFetchingPreview'));
      }

      applyPreviewData(url, data);
    },
    onError: (fetchError: unknown) => {
      setError(fetchError instanceof Error ? fetchError.message : t('errorFetchingPreview'));
    },
  });

  const loading = previewQuery.isFetching || fetchPreviewMutation.isPending;

  useEffect(() => {
    if (!shouldAutoFetchPreview) return;

    if (previewQuery.data && node.attrs.url) {
      applyPreviewData(node.attrs.url, previewQuery.data);
      return;
    }

    if (previewQuery.error) {
      setError(previewQuery.error instanceof Error ? previewQuery.error.message : t('errorFetchingPreview'));
    }
  }, [applyPreviewData, node.attrs.url, previewQuery.data, previewQuery.error, shouldAutoFetchPreview, t]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);
  useEffect(() => {
    setButtonLabel(node.attrs.buttonLabel || t('visitSite'));
    setShowButton(node.attrs.showButton);
    setOpenInPopup(node.attrs.openInPopup);
  }, [node.attrs.buttonLabel, node.attrs.showButton, node.attrs.openInPopup, t]);

  useEffect(() => {
    if (!node.attrs.url) {
      setEditing(true);
      setModalOpen(true);
    }
  }, [node.attrs.url]);

  function handleAlignmentChange(value: string) {
    updateAttributes({ alignment: value });
  }

  const handleEdit = () => {
    setEditing(true);
    setInputUrl(node.attrs.url || '');
    setModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (inputUrl && inputUrl !== node.attrs.url) {
      setError(null);
      void fetchPreviewMutation.mutateAsync(inputUrl);
    } else {
      setEditing(false);
      setModalOpen(false);
    }
    updateAttributes({ buttonLabel, showButton, openInPopup });
    setModalOpen(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setInputUrl(node.attrs.url || '');
    setError(null);
    setModalOpen(false);
  };

  const handleDelete = () => {
    if (typeof deleteNode === 'function') {
      deleteNode();
    } else {
      updateAttributes({
        url: null,
        title: null,
        description: null,
        og_image: null,
        favicon: null,
        og_type: null,
        og_url: null,
      });
    }
  };

  const alignmentClass = getAlignmentClass(node.attrs.alignment || 'left');

  return (
    <NodeViewWrapper className="web-preview-block relative">
      {/* Popup Modal for Embedded Website */}
      <Modal
        isDialogOpen={popupOpen}
        onOpenChange={setPopupOpen}
        dialogTitle={previewData.title || t('websitePreview')}
        minWidth="xl"
        minHeight="xl"
        dialogContent={
          previewUrl ? (
            <iframe
              src={previewUrl}
              title={t('embeddedWebsitePreview')}
              className="h-full w-full border-0 bg-white"
              style={{ display: 'block', borderRadius: 0 }}
              allowFullScreen
            />
          ) : null
        }
      />
      <div className={`flex w-full ${alignmentClass}`}>
        {/* CardWrapper */}
        <div className="soft-shadow relative my-2 max-w-[420px] min-w-[260px] rounded-xl bg-white px-6 pt-6 pb-4">
          {/* PreviewCard */}
          {/* Floating edit and delete buttons (only if not editing and isEditable) */}
          {isEditable && !editing ? (
            <div className="absolute -top-3 -right-3 z-20 flex flex-col gap-2">
              <button
                className="flex items-center justify-center rounded-md border border-yellow-200 bg-yellow-50 p-1.5 text-yellow-700 shadow-md hover:bg-yellow-100"
                onClick={handleEdit}
                title={t('editUrl')}
                type="button"
              >
                <Edit2 size={16} />
              </button>
              <button
                className="flex items-center justify-center rounded-md border border-red-200 bg-red-50 p-1.5 text-red-700 shadow-md hover:bg-red-100"
                onClick={handleDelete}
                title={t('deleteCard')}
                type="button"
              >
                <Trash size={16} />
              </button>
            </div>
          ) : null}
          {/* Modal for editing */}
          <Modal
            isDialogOpen={modalOpen}
            onOpenChange={(open) => {
              setModalOpen(open);
              if (!open) handleCancelEdit();
            }}
            dialogTitle={t('editWebPreviewCard')}
            dialogDescription={t('editWebPreviewDescription')}
            minWidth="md"
            dialogContent={
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEdit();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="web-url-input">{t('websiteUrl')}</Label>
                  <Input
                    id="web-url-input"
                    ref={inputRef}
                    type="text"
                    placeholder={t('enterWebsiteUrl')}
                    value={inputUrl}
                    onChange={(e) => {
                      setInputUrl(e.target.value);
                    }}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('buttonOptions')}</Label>
                  <div className="flex flex-col gap-3 pt-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="show-button"
                        checked={showButton}
                        onCheckedChange={(checked) => {
                          setShowButton(checked);
                        }}
                      />
                      <Label
                        htmlFor="show-button"
                        className="text-sm"
                      >
                        {t('showButton')}
                      </Label>
                    </div>
                    {showButton ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="open-in-popup"
                            checked={openInPopup}
                            onCheckedChange={(checked) => {
                              setOpenInPopup(checked);
                            }}
                          />
                          <Label
                            htmlFor="open-in-popup"
                            className="text-sm"
                          >
                            {t('openInPopup')}
                          </Label>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label
                            htmlFor="button-label"
                            className="text-sm"
                          >
                            {t('buttonLabel')}
                          </Label>
                          <Input
                            id="button-label"
                            type="text"
                            value={buttonLabel}
                            onChange={(e) => {
                              setButtonLabel(e.target.value);
                            }}
                            placeholder={t('buttonLabelPlaceholder')}
                            className="w-36"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-">
                  <Label>{t('alignment')}</Label>
                  <div className="flex gap-2 pt-3">
                    {ALIGNMENTS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={alignment === opt.value ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={alignment === opt.value}
                        onClick={() => {
                          handleAlignmentChange(opt.value);
                        }}
                        className={`rounded-full px-2 py-1 ${alignment === opt.value ? 'bg-black text-white' : ''}`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
                  >
                    <span className="flex items-center">
                      <X
                        size={16}
                        className="mr-1"
                      />
                      {t('cancel')}
                    </span>
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !inputUrl}
                  >
                    <span className="flex items-center">
                      <Save
                        size={16}
                        className="mr-1"
                      />
                      {t('save')}
                    </span>
                  </Button>
                </div>
              </form>
            }
          />
          {/* Only show preview card when not editing */}
          {hasPreview && !editing ? (
            <>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="no-underline hover:no-underline focus:no-underline active:no-underline"
                style={{ textDecoration: 'none', borderBottom: 'none' }}
              >
                {previewData.og_image ? (
                  <PreviewImage
                    src={previewData.og_image}
                    alt={t('previewImageAlt')}
                  />
                ) : null}
                <div className="pt-4 pb-2">
                  <span
                    className="text-foreground mb-1.5 text-lg leading-tight font-semibold no-underline hover:no-underline focus:no-underline active:no-underline"
                    style={{ textDecoration: 'none', borderBottom: 'none' }}
                  >
                    {previewData.title}
                  </span>
                  <span
                    className="mb-3 block text-sm leading-snug text-gray-700 no-underline hover:no-underline focus:no-underline active:no-underline"
                    style={{ textDecoration: 'none', borderBottom: 'none' }}
                  >
                    {previewData.description}
                  </span>
                </div>
              </a>
              <FaviconDisplay
                favicon={previewData.favicon ?? undefined}
                url={previewUrl ?? ''}
                faviconAlt={t('faviconAlt')}
              />
              {showButton && previewData.url ? (
                openInPopup ? (
                  <button
                    type="button"
                    className="soft-shadow mt-4 block w-full rounded-xl bg-black px-4 py-2.5 text-center text-[16px] font-semibold text-white no-underline transition-all hover:bg-gray-900 hover:shadow-lg"
                    style={{ textDecoration: 'none', color: 'white' }}
                    onClick={() => {
                      setPopupOpen(true);
                    }}
                  >
                    {buttonLabel || t('visitSite')}
                  </button>
                ) : (
                  <a
                    href={previewData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="soft-shadow mt-4 block w-full rounded-xl bg-black px-4 py-2.5 text-center text-[16px] font-semibold text-white no-underline transition-all hover:bg-gray-900 hover:shadow-lg"
                    style={{ textDecoration: 'none', color: 'white' }}
                  >
                    {buttonLabel || t('visitSite')}
                  </a>
                )
              ) : null}
              {/* Alignment bar in view mode */}
              {isEditable ? (
                <AlignmentControls
                  alignment={alignment}
                  onAlignmentChange={handleAlignmentChange}
                  alignments={ALIGNMENTS}
                  t={t}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export default WebPreviewComponent;
