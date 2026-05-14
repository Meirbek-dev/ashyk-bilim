'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTiptap } from '@tiptap/react';
import { useEmbedPanelStore } from './EmbedPanelStore';
import { EmbedTypeSelector } from './EmbedTypeSelector';
import { YouTubeEmbedForm } from './YouTubeEmbedForm';
import { ExcalidrawEmbedForm } from './ExcalidrawEmbedForm';
import { TldrawEmbedForm } from './TldrawEmbedForm';
import {
  parseYouTubeUrl,
  validateExcalidrawUrl,
  validateTldrawUrl,
} from '@components/Objects/Editor/Extensions/EmbedBlock/embed-validators';
import type { EmbedType } from './EmbedPanelStore';

// ── Focusable element selector ────────────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    // Use getComputedStyle for visibility — works in both browser and jsdom
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * EmbedPanel — modal dialog for inserting or editing an EmbedBlock node.
 *
 * Fully driven by `EmbedPanelStore` — no props required.
 *
 * Accessibility:
 * - `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title element id
 * - Focus moves to first focusable element within 100ms of opening
 * - Tab / Shift+Tab cycle within the dialog (focus trap)
 * - Escape closes and returns focus to the trigger
 * - Focus returns to `triggerRef` on any close path
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.2, 12.3, 12.4, 12.5, 12.6
 */
export function EmbedPanel() {
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const { editor } = useTiptap();

  // ── Store ──────────────────────────────────────────────────────────────────
  const isOpen = useEmbedPanelStore((s) => s.isOpen);
  const mode = useEmbedPanelStore((s) => s.mode);
  const nodePos = useEmbedPanelStore((s) => s.nodePos);
  const initialType = useEmbedPanelStore((s) => s.initialType);
  const initialUrl = useEmbedPanelStore((s) => s.initialUrl);
  const triggerRef = useEmbedPanelStore((s) => s.triggerRef);
  const close = useEmbedPanelStore((s) => s.close);

  // ── Local state ────────────────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState<EmbedType | null>(null);
  const [url, setUrl] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // ── Sync local state when panel opens ─────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setSelectedType(initialType);
      setUrl(initialUrl);
      setTypeError(null);
      setUrlError(null);
    }
  }, [isOpen, initialType, initialUrl]);

  // ── Focus management: move focus to first focusable element on open ────────
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // ── Close helper: returns focus to trigger ────────────────────────────────
  const handleClose = useCallback(() => {
    close();
    // Return focus to the trigger button (Req 12.6)
    setTimeout(() => {
      triggerRef?.current?.focus();
    }, 0);
  }, [close, triggerRef]);

  // ── Focus trap: Tab / Shift+Tab cycle within dialog ────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const container = dialogRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        // Shift+Tab: if focus is on first element, wrap to last
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on last element, wrap to first
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [handleClose],
  );

  // ── Focus trap: return focus if it escapes the dialog (Req 12.5) ──────────
  useEffect(() => {
    if (!isOpen) return;

    const handleFocusIn = (e: FocusEvent) => {
      const container = dialogRef.current;
      if (!container) return;
      if (!container.contains(e.target as Node)) {
        const focusable = getFocusableElements(container);
        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [isOpen]);

  // ── Insert handler ─────────────────────────────────────────────────────────
  const handleInsert = useCallback(() => {
    // Validate: type must be selected
    if (!selectedType) {
      setTypeError(t('errorEmpty'));
      return;
    }

    // Validate: URL must be valid for the selected type
    let validationError: string | null = null;

    if (selectedType === 'youtube') {
      const videoId = parseYouTubeUrl(url);
      if (url.trim() === '') {
        validationError = 'errorEmpty';
      } else if (videoId === null) {
        validationError = 'errorInvalid';
      }

      if (validationError) {
        setUrlError(validationError);
        return;
      }

      // For YouTube: store the video ID as the url attribute
      const videoIdValue = parseYouTubeUrl(url)!;

      if (mode === 'edit' && nodePos !== null) {
        editor.commands.updateEmbedBlock(nodePos, { type: 'youtube', url: videoIdValue });
      } else {
        editor.commands.insertEmbedBlock({ type: 'youtube', url: videoIdValue });
      }
    } else if (selectedType === 'excalidraw') {
      validationError = validateExcalidrawUrl(url);
      if (validationError) {
        setUrlError(validationError);
        return;
      }

      if (mode === 'edit' && nodePos !== null) {
        editor.commands.updateEmbedBlock(nodePos, { type: 'excalidraw', url });
      } else {
        editor.commands.insertEmbedBlock({ type: 'excalidraw', url });
      }
    } else if (selectedType === 'tldraw') {
      validationError = validateTldrawUrl(url);
      if (validationError) {
        setUrlError(validationError);
        return;
      }

      if (mode === 'edit' && nodePos !== null) {
        editor.commands.updateEmbedBlock(nodePos, { type: 'tldraw', url });
      } else {
        editor.commands.insertEmbedBlock({ type: 'tldraw', url });
      }
    }

    handleClose();
  }, [selectedType, url, mode, nodePos, editor, handleClose, t]);

  // ── Type selection: clear type error when a type is selected ──────────────
  const handleTypeSelect = useCallback((type: EmbedType) => {
    setSelectedType(type);
    setTypeError(null);
    // Reset URL and URL error when switching types
    setUrl('');
    setUrlError(null);
  }, []);

  // ── Don't render when closed ───────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-background border-border relative z-50 w-full max-w-lg rounded-xl border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Title */}
        <h2
          id={titleId}
          className="text-foreground mb-5 text-lg font-semibold"
        >
          {t('title')}
        </h2>

        {/* Embed type selector */}
        <div className="mb-4">
          <EmbedTypeSelector
            selectedType={selectedType}
            onSelect={handleTypeSelect}
            error={typeError}
          />
        </div>

        {/* Per-type URL form */}
        {selectedType === 'youtube' && (
          <div className="mb-5">
            <YouTubeEmbedForm
              url={url}
              onChange={setUrl}
              error={urlError}
              onErrorChange={setUrlError}
            />
          </div>
        )}
        {selectedType === 'excalidraw' && (
          <div className="mb-5">
            <ExcalidrawEmbedForm
              url={url}
              onChange={setUrl}
              error={urlError}
              onErrorChange={setUrlError}
            />
          </div>
        )}
        {selectedType === 'tldraw' && (
          <div className="mb-5">
            <TldrawEmbedForm
              url={url}
              onChange={setUrl}
              error={urlError}
              onErrorChange={setUrlError}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="border-border text-foreground hover:bg-accent rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            {t('cancelButton')}
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {t('insertButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
