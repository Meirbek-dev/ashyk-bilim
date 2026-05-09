'use client';

import {
  SiCrewai,
  SiFigma,
  SiGithub,
  SiGoogledocs,
  SiGoogleforms,
  SiGooglemaps,
  SiNotion,
  SiYoutube,
} from '@icons-pack/react-simple-icons';
import {
  AlignCenter,
  BoxIcon,
  Code,
  Edit2,
  GripHorizontal,
  GripVertical,
  HelpCircle,
  Link,
  LinkIcon,
  Trash2,
  X,
} from 'lucide-react';
import type { CSSProperties, ChangeEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import DOMPurify from 'dompurify';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type EmbedType = 'url' | 'code';
type Alignment = 'left' | 'center';
type ActiveInput = 'none' | 'url' | 'code';

interface ScriptEmbedConfig {
  src: string;
  identifier: string;
}

interface SupportedProduct {
  name: string;
  icon: any;
  color: string;
  guide: string;
}

interface EmbedNodeAttrs {
  embedUrl: string | null;
  embedCode: string | null;
  embedType: EmbedType | null;
  embedHeight: number;
  embedWidth: string;
  alignment: Alignment;
}

const SCRIPT_BASED_EMBEDS: Record<string, ScriptEmbedConfig> = {
  twitter: {
    src: 'https://platform.twitter.com/widgets.js',
    identifier: 'twitter-tweet',
  },
  instagram: {
    src: 'https://www.instagram.com/embed.js',
    identifier: 'instagram-media',
  },
  tiktok: {
    src: 'https://www.tiktok.com/embed.js',
    identifier: 'tiktok-embed',
  },
};

const SUPPORTED_PRODUCTS: SupportedProduct[] = [
  {
    name: 'G Docs',
    icon: SiGoogledocs,
    color: '#4285F4',
    guide: 'https://support.google.com/docs/answer/183965',
  },
  {
    name: 'YouTube',
    icon: SiYoutube,
    color: '#FF0000',
    guide: 'https://support.google.com/youtube/answer/171780?hl=en',
  },
  { name: 'GitHub', icon: SiGithub, color: '#181717', guide: 'https://emgithub.com/' },

  {
    name: 'CodePen',
    icon: BoxIcon,
    color: '#000000',
    guide: 'https://blog.codepen.io/documentation/embedded-pens/',
  },
  {
    name: 'Figma',
    icon: SiFigma,
    color: '#F24E1E',
    guide: 'https://help.figma.com/hc/en-us/articles/360041057214',
  },
  {
    name: 'GMaps',
    icon: SiGooglemaps,
    color: '#4285F4',
    guide: 'https://developers.google.com/maps/documentation/embed/get-started',
  },
  {
    name: 'Canva',
    icon: SiCrewai,
    color: '#00C4CC',
    guide: 'https://www.canva.com/help/article/embed-designs',
  },
  {
    name: 'Notion',
    icon: SiNotion,
    color: '#878787',
    guide: 'https://www.notion.so/help/embed-and-connect-other-apps',
  },
  {
    name: 'SlideShare',
    icon: LinkIcon,
    color: '#0077B5',
    guide: 'https://www.slideshare.net/help/embedding-slideshows',
  },
  {
    name: 'Google Slides',
    icon: SiGoogledocs,
    color: '#F9AB00',
    guide: 'https://support.google.com/docs/answer/183965',
  },
  {
    name: 'PowerPoint',
    icon: LinkIcon,
    color: '#D24726',
    guide:
      'https://support.microsoft.com/en-us/office/embed-powerpoint-presentations-on-your-website-6ac2f112-3b21-4a62-920b-3a83a7c2f0c0',
  },
  {
    name: 'CodeSandbox',
    icon: BoxIcon,
    color: '#000000',
    guide: 'https://codesandbox.io/docs/embedding',
  },
  {
    name: 'JSFiddle',
    icon: LinkIcon,
    color: '#39B0FF',
    guide: 'https://jsfiddle.net/about/embed/',
  },
  {
    name: 'Google Forms',
    icon: SiGoogleforms,
    color: '#34A853',
    guide: 'https://support.google.com/docs/answer/2839588',
  },
];

const YOUTUBE_HOSTNAMES = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be']);
const YOUTUBE_VIDEO_ID_LENGTH = 11;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const isYouTubeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return YOUTUBE_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
};

const getYouTubeEmbedUrl = (url: string): string => {
  if (!isYouTubeUrl(url)) return url;

  const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/i;
  const match = youtubeRegex.exec(url);

  if (match?.[1]?.length === YOUTUBE_VIDEO_ID_LENGTH) {
    return `https://www.youtube.com/embed/${match[1]}?autoplay=0&rel=0`;
  }

  return url;
};

const sanitizeUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const sanitized = DOMPurify.sanitize(trimmed);
  if (!sanitized) return '';

  try {
    const parsed = new URL(sanitized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return sanitized;
  } catch {
    if (!/^[A-Za-z]+:\/\//.test(sanitized)) {
      return `https://${sanitized}`;
    }
    return sanitized;
  }
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const EmbedContent = ({
  embedUrl,
  sanitizedEmbedCode,
  embedType,
  embeddedTitle,
}: {
  embedUrl: string;
  sanitizedEmbedCode: string;
  embedType: EmbedType;
  embeddedTitle?: string;
}) => {
  useEffect(() => {
    if (embedType !== 'code' || !sanitizedEmbedCode) return;

    const matchingPlatform = Object.entries(SCRIPT_BASED_EMBEDS).find(([_, config]) =>
      sanitizedEmbedCode.includes(config.identifier),
    );

    if (!matchingPlatform) return;

    const [_, config] = matchingPlatform;
    const script = document.createElement('script');
    script.src = config.src;
    script.async = true;
    document.body.append(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [embedType, sanitizedEmbedCode]);

  if (embedType === 'url' && embedUrl) {
    const processedUrl = isYouTubeUrl(embedUrl) ? getYouTubeEmbedUrl(embedUrl) : embedUrl;
    return (
      <iframe
        src={processedUrl}
        className="h-full w-full border-0"
        allowFullScreen
        title={embeddedTitle ?? 'Embedded content'}
      />
    );
  }

  if (embedType === 'code' && sanitizedEmbedCode) {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: sanitizedEmbedCode }}
        className="h-full w-full"
      />
    );
  }

  return null;
};

const ProductIcon = ({ product, onClick }: { product: SupportedProduct; onClick: () => void }) => {
  const isMobile = useIsMobile();
  const t = useTranslations('DashPage.Editor.EmbedObjects');

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-1.5 transition-transform hover:scale-105 active:scale-95"
      title={t('addProductEmbedTitle', { productName: product.name })}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm transition-shadow group-hover:shadow-md sm:h-12 sm:w-12"
        style={{ backgroundColor: product.color }}
      >
        <product.icon
          size={isMobile ? 20 : 26}
          color="#FFFFFF"
        />
      </div>
      <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">{product.name}</span>
    </button>
  );
};

const EmbedToolbar = ({
  onEdit,
  onCenter,
  onRemove,
  alignment,
  t,
}: {
  onEdit: () => void;
  onCenter: () => void;
  onRemove: () => void;
  alignment: Alignment;
  t: any;
}) => (
  <div className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-white/90 p-1 opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover:opacity-100">
    <button
      onClick={onEdit}
      className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      title={t('editEmbedTitle')}
    >
      <Edit2 size={16} />
    </button>
    <button
      onClick={onCenter}
      className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      title={alignment === 'center' ? t('alignLeftTitle') : t('centerAlignTitle')}
    >
      <AlignCenter size={16} />
    </button>
    <button
      onClick={onRemove}
      className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
      title={t('removeEmbedTitle')}
    >
      <Trash2 size={16} />
    </button>
  </div>
);

const InputModal = ({
  activeInput,
  embedUrl,
  embedCode,
  selectedProduct,
  onClose,
  onUrlChange,
  onCodeChange,
  onSubmit,
  onOpenDocs,
  t,
}: {
  activeInput: ActiveInput;
  embedUrl: string;
  embedCode: string;
  selectedProduct: SupportedProduct | null;
  onClose: () => void;
  onUrlChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onCodeChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (formData: FormData) => void;
  onOpenDocs: () => void;
  t: any;
}) => {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      requestAnimationFrame(() => {
        if (activeInput === 'url') urlInputRef.current?.focus();
        else if (activeInput === 'code') codeInputRef.current?.focus();
      });
    }, 50);
    return () => clearTimeout(timeout);
  }, [activeInput]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  const isValid = (activeInput === 'url' && embedUrl) || (activeInput === 'code' && embedCode);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/20 p-4 backdrop-blur-sm">
      <form
        action={onSubmit}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedProduct && activeInput === 'url' && (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: selectedProduct.color }}
              >
                <selectedProduct.icon
                  size={20}
                  color="#FFFFFF"
                />
              </div>
            )}
            <h3 className="text-lg font-semibold text-gray-900">
              {activeInput === 'url'
                ? selectedProduct
                  ? t('addProductEmbedTitle', { productName: selectedProduct.name })
                  : t('addEmbedUrlTitle')
                : t('addEmbedCodeTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Input */}
        {activeInput === 'url' ? (
          <div className="mb-3">
            <div className="relative">
              <Link
                className="absolute top-1/2 left-3 -translate-y-1/2 text-blue-500"
                size={18}
              />
              <input
                ref={urlInputRef}
                name="embedUrl"
                type="text"
                value={embedUrl}
                onChange={onUrlChange}
                className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 py-3 pr-4 pl-11 transition-all focus:border-blue-500 focus:bg-white focus:outline-hidden"
                placeholder={
                  selectedProduct
                    ? t('productUrlPlaceholder', { productName: selectedProduct.name })
                    : t('urlPlaceholder')
                }
              />
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <Textarea
              ref={codeInputRef}
              name="embedCode"
              value={embedCode}
              onChange={onCodeChange}
              className="min-h-[140px] w-full rounded-xl border-2 border-gray-200 bg-gray-50 font-mono text-sm transition-all focus:border-blue-500 focus:bg-white"
              placeholder={t('codePlaceholder')}
            />
          </div>
        )}

        {/* Help Text */}
        <div className="mb-4 flex justify-end">
          {selectedProduct && (
            <button
              type="button"
              onClick={onOpenDocs}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              <HelpCircle size={14} />
              {t('guide')}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('apply')}
          </button>
        </div>
      </form>
    </div>
  );
};

const EmptyState = ({
  onProductSelect,
  onUrlClick,
  onCodeClick,
  isEditable,
  t,
}: {
  onProductSelect: (product: SupportedProduct) => void;
  onUrlClick: () => void;
  onCodeClick: () => void;
  isEditable: boolean;
  t: any;
}) => (
  <div className="flex h-full w-full flex-col items-center justify-center p-6">
    <p className="mb-5 text-center text-lg font-medium text-gray-700">{t('addEmbedFrom')}</p>

    <div className="mb-6 grid grid-cols-4 gap-4 sm:grid-cols-6 lg:grid-cols-7">
      {SUPPORTED_PRODUCTS.map((product) => (
        <ProductIcon
          key={product.name}
          product={product}
          onClick={() => onProductSelect(product)}
        />
      ))}
    </div>

    <p className="mb-4 max-w-md text-center text-sm text-gray-500">{t('clickServiceToAdd')}</p>

    {isEditable && (
      <div className="flex gap-3">
        <button
          onClick={onUrlClick}
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 hover:shadow"
        >
          <LinkIcon size={16} />
          {t('urlButton')}
        </button>
        <button
          onClick={onCodeClick}
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 hover:shadow"
        >
          <Code size={16} />
          {t('codeButton')}
        </button>
      </div>
    )}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const EmbedObjectsComponent = (props: TypedNodeViewProps<EmbedNodeAttrs>) => {
  const t = useTranslations('DashPage.Editor.EmbedObjects');
  const { updateAttributes } = props;
  const isMobile = useIsMobile();
  const { isEditable } = useEditorProvider();

  // State
  const [embedType, setEmbedType] = useState<EmbedType>(props.node.attrs.embedType || 'url');
  const [embedUrl, setEmbedUrl] = useState(props.node.attrs.embedUrl || '');
  const [embedCode, setEmbedCode] = useState(props.node.attrs.embedCode || '');
  const [embedHeight, setEmbedHeight] = useState(props.node.attrs.embedHeight || 300);
  const [embedWidth, setEmbedWidth] = useState(props.node.attrs.embedWidth || '100%');
  const [alignment, setAlignment] = useState<Alignment>(props.node.attrs.alignment || 'left');
  const [isResizing, setIsResizing] = useState(false);
  const [parentWidth, setParentWidth] = useState<number | null>(null);
  const [activeInput, setActiveInput] = useState<ActiveInput>('none');
  const [selectedProduct, setSelectedProduct] = useState<SupportedProduct | null>(null);

  // Refs
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensionsRef = useRef({ width: embedWidth, height: embedHeight });
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

  // Sanitized embed code
  const sanitizedEmbedCode = useMemo(
    () =>
      embedType === 'code' && embedCode ? DOMPurify.sanitize(embedCode, { ADD_TAGS: ['iframe'], ADD_ATTR: ['*'] }) : '',
    [embedType, embedCode],
  );

  // Handlers
  const handleUrlChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeUrl(e.target.value);
      setEmbedUrl(sanitized);
      updateAttributes({ embedUrl: sanitized, embedType: 'url' });
    },
    [updateAttributes],
  );

  const handleCodeChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const { value } = e.target;
      if (value === '' || value.trim()) {
        setEmbedCode(value);
        updateAttributes({ embedCode: value, embedType: 'code' });
      }
    },
    [updateAttributes],
  );

  const handleProductSelection = useCallback((product: SupportedProduct) => {
    setEmbedType('url');
    setActiveInput('url');
    setSelectedProduct(product);
  }, []);

  const handleCenterBlock = useCallback(() => {
    const newAlignment: Alignment = alignment === 'center' ? 'left' : 'center';
    setAlignment(newAlignment);
    updateAttributes({ alignment: newAlignment });
  }, [alignment, updateAttributes]);

  const handleRemove = useCallback(() => {
    setEmbedUrl('');
    setEmbedCode('');
    updateAttributes({ embedUrl: '', embedCode: '' });
  }, [updateAttributes]);

  const handleInputSubmit = useCallback(
    (formData: FormData) => {
      if (activeInput === 'url') {
        const nextUrl = sanitizeUrl(String(formData.get('embedUrl') ?? ''));
        setEmbedType('url');
        setEmbedUrl(nextUrl);
        updateAttributes({ embedUrl: nextUrl, embedType: 'url' });
      }

      if (activeInput === 'code') {
        const nextCode = String(formData.get('embedCode') ?? '');
        if (nextCode === '' || nextCode.trim()) {
          setEmbedType('code');
          setEmbedCode(nextCode);
          updateAttributes({ embedCode: nextCode, embedType: 'code' });
        }
      }

      setActiveInput('none');
    },
    [activeInput, updateAttributes],
  );

  const handleOpenDocs = useCallback(() => {
    if (selectedProduct) {
      window.open(selectedProduct.guide, '_blank', 'noopener,noreferrer');
    }
  }, [selectedProduct]);

  const handleResizeStart = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, direction: 'horizontal' | 'vertical') => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = resizeRef.current?.offsetWidth || 0;
      const startHeight = resizeRef.current?.offsetHeight || 0;

      const handleMouseMove = (e: MouseEvent) => {
        if (!resizeRef.current) return;

        if (direction === 'horizontal') {
          const newWidth = startWidth + e.clientX - startX;
          const parentWidth = resizeRef.current.parentElement?.offsetWidth || 1;
          const widthPercentage = Math.min(100, Math.max(10, (newWidth / parentWidth) * 100));
          const newWidthValue = `${widthPercentage}%`;
          dimensionsRef.current.width = newWidthValue;
          resizeRef.current.style.width = newWidthValue;
        } else {
          const newHeight = Math.max(100, startHeight + e.clientY - startY);
          dimensionsRef.current.height = newHeight;
          resizeRef.current.style.height = `${newHeight}px`;
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        setEmbedWidth(dimensionsRef.current.width);
        setEmbedHeight(dimensionsRef.current.height);
        updateAttributes({
          embedWidth: dimensionsRef.current.width,
          embedHeight: dimensionsRef.current.height,
        });

        if (mouseMoveHandlerRef.current) {
          document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
          mouseMoveHandlerRef.current = null;
        }
        if (mouseUpHandlerRef.current) {
          document.removeEventListener('mouseup', mouseUpHandlerRef.current);
          mouseUpHandlerRef.current = null;
        }
      };

      mouseMoveHandlerRef.current = handleMouseMove;
      mouseUpHandlerRef.current = handleMouseUp;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [updateAttributes],
  );

  // Responsive styles
  const getResponsiveStyles = useCallback((): CSSProperties => {
    const styles: CSSProperties = {
      height: `${embedHeight}px`,
      width: embedWidth,
    };

    if (parentWidth) {
      if (isMobile) {
        styles.width = '100%';
        styles.minWidth = 'unset';
      } else {
        styles.minWidth = `${Math.min(parentWidth, 400)}px`;
        styles.maxWidth = '100%';
      }
    }

    return styles;
  }, [embedHeight, embedWidth, parentWidth, isMobile]);

  // Effects
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current?.parentElement) return;

      const newParentWidth = containerRef.current.parentElement.offsetWidth;
      setParentWidth(newParentWidth);

      if (typeof embedWidth === 'string' && embedWidth.endsWith('%')) {
        const percentage = Number.parseInt(embedWidth, 10);
        const newWidth = `${Math.min(100, percentage)}%`;
        setEmbedWidth(newWidth);
        updateAttributes({ embedWidth: newWidth });
      } else if (newParentWidth < Number.parseInt(embedWidth, 10)) {
        setEmbedWidth('100%');
        updateAttributes({ embedWidth: '100%' });
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current?.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }

    return () => resizeObserver.disconnect();
  }, [embedWidth, updateAttributes]);

  useEffect(() => {
    return () => {
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        document.removeEventListener('mouseup', mouseUpHandlerRef.current);
      }
    };
  }, []);

  // Render
  const hasContent = embedUrl || sanitizedEmbedCode;

  return (
    <NodeViewWrapper
      className="embed-block w-full"
      ref={containerRef}
    >
      <div
        ref={resizeRef}
        className={`group relative flex items-center justify-center overflow-hidden rounded-xl bg-gray-100 transition-shadow hover:shadow-sm ${
          alignment === 'center' ? 'mx-auto' : ''
        }`}
        style={getResponsiveStyles()}
      >
        {hasContent ? (
          <>
            {!isResizing && (
              <EmbedContent
                embedUrl={embedUrl}
                sanitizedEmbedCode={sanitizedEmbedCode}
                embedType={embedType}
                embeddedTitle={t('embeddedContent')}
              />
            )}
            {isEditable && (
              <EmbedToolbar
                onEdit={() => setActiveInput(embedType)}
                onCenter={handleCenterBlock}
                onRemove={handleRemove}
                alignment={alignment}
                t={t}
              />
            )}
          </>
        ) : (
          <EmptyState
            onProductSelect={handleProductSelection}
            onUrlClick={() => {
              setEmbedType('url');
              setActiveInput('url');
            }}
            onCodeClick={() => {
              setEmbedType('code');
              setActiveInput('code');
            }}
            isEditable={isEditable}
            t={t}
          />
        )}

        {isEditable && activeInput !== 'none' && (
          <InputModal
            activeInput={activeInput}
            embedUrl={embedUrl}
            embedCode={embedCode}
            selectedProduct={selectedProduct}
            onClose={() => setActiveInput('none')}
            onUrlChange={handleUrlChange}
            onCodeChange={handleCodeChange}
            onSubmit={handleInputSubmit}
            onOpenDocs={handleOpenDocs}
            t={t}
          />
        )}

        {isEditable && hasContent && (
          <>
            <div
              className="absolute top-0 right-0 bottom-0 flex w-4 cursor-ew-resize items-center justify-center bg-white/70 opacity-0 transition-opacity hover:bg-white/90 hover:opacity-100"
              role="button"
              tabIndex={0}
              onMouseDown={(e) => handleResizeStart(e, 'horizontal')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleResizeStart(e as any, 'horizontal');
              }}
            >
              <GripVertical
                size={16}
                className="text-gray-600"
              />
            </div>
            <div
              className="absolute right-0 bottom-0 left-0 flex h-4 cursor-ns-resize items-center justify-center bg-white/70 opacity-0 transition-opacity hover:bg-white/90 hover:opacity-100"
              role="button"
              tabIndex={0}
              onMouseDown={(e) => handleResizeStart(e, 'vertical')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleResizeStart(e as any, 'vertical');
              }}
            >
              <GripHorizontal
                size={16}
                className="text-gray-600"
              />
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export default EmbedObjectsComponent;
