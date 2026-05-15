'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTiptap } from '@tiptap/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEmbedPanelStore } from './EmbedPanelStore';
import { EmbedTypeSelector } from './EmbedTypeSelector';
import { EmbedUrlForm } from './EmbedUrlForm';
import { DEFAULT_EMBED_TYPE, getEmbedProvider } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options';
import type { EmbedType } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options';
import { normalizeEmbedUrl, validateEmbedUrl } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-validators';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.hasAttribute('disabled')) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export function EmbedPanel() {
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const { editor } = useTiptap();
  const isOpen = useEmbedPanelStore((state) => state.isOpen);
  const mode = useEmbedPanelStore((state) => state.mode);
  const nodePos = useEmbedPanelStore((state) => state.nodePos);
  const initialType = useEmbedPanelStore((state) => state.initialType);
  const initialUrl = useEmbedPanelStore((state) => state.initialUrl);
  const triggerRef = useEmbedPanelStore((state) => state.triggerRef);
  const close = useEmbedPanelStore((state) => state.close);

  const [selectedType, setSelectedType] = useState<EmbedType | null>(null);
  const [url, setUrl] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setSelectedType(initialType ?? DEFAULT_EMBED_TYPE);
    setUrl(initialUrl);
    setTypeError(null);
    setUrlError(null);
  }, [initialType, initialUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (!dialogRef.current) return;
      getFocusableElements(dialogRef.current)[0]?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    close();
    setTimeout(() => {
      triggerRef?.current?.focus();
    }, 0);
  }, [close, triggerRef]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = dialogRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    },
    [handleClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleFocusIn = (event: FocusEvent) => {
      const container = dialogRef.current;
      if (!container || container.contains(event.target as Node)) return;
      getFocusableElements(container)[0]?.focus();
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [isOpen]);

  const handleTypeSelect = useCallback((type: EmbedType) => {
    setSelectedType(type);
    setTypeError(null);
    setUrl('');
    setUrlError(null);
  }, []);

  const handleInsert = useCallback(() => {
    if (!editor) return;

    if (!selectedType) {
      setTypeError(t('errorSelectType'));
      return;
    }

    const validationError = validateEmbedUrl(selectedType, url);
    if (validationError) {
      setUrlError(validationError);
      return;
    }

    const normalizedUrl = normalizeEmbedUrl(selectedType, url);
    const provider = getEmbedProvider(selectedType);
    const attrs = {
      type: selectedType,
      url: normalizedUrl,
      height: provider?.defaultHeight ?? 520,
    };

    if (mode === 'edit' && nodePos !== null) {
      editor.commands.updateEmbedBlock(nodePos, attrs);
    } else {
      editor.chain().focus().insertEmbedBlock(attrs).run();
    }

    handleClose();
  }, [editor, handleClose, mode, nodePos, selectedType, t, url]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-background border-border relative z-50 flex max-h-[min(860px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2
              id={titleId}
              className="text-foreground text-lg font-semibold"
            >
              {mode === 'edit' ? t('editTitle') : t('title')}
            </h2>
            <p
              id={descriptionId}
              className="text-muted-foreground mt-1 text-sm"
            >
              {t('description')}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            aria-label={t('cancelButton')}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <EmbedTypeSelector
            selectedType={selectedType}
            onSelect={handleTypeSelect}
            error={typeError}
          />

          <div className="border-border bg-muted/20 h-fit rounded-lg border p-4">
            {selectedType ? (
              <EmbedUrlForm
                type={selectedType}
                url={url}
                onChange={setUrl}
                error={urlError}
                onErrorChange={setUrlError}
              />
            ) : (
              <p className="text-muted-foreground text-sm">{t('selectServiceFirst')}</p>
            )}
          </div>
        </div>

        <div className="border-border bg-background flex justify-end gap-3 border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
          >
            {t('cancelButton')}
          </Button>
          <Button
            type="button"
            onClick={handleInsert}
          >
            {mode === 'edit' ? t('updateButton') : t('insertButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
