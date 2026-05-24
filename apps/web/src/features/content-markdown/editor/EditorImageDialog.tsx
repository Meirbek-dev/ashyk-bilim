'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isSafeMarkdownUrl } from '../utils/markdown-sanitize';

interface EditorImageDialogProps {
  onConfirm: (src: string, alt: string) => void;
  onClose: () => void;
}

export function EditorImageDialog({ onConfirm, onClose }: EditorImageDialogProps) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [touched, setTouched] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const srcValid = !src.trim() || isSafeMarkdownUrl(src.trim());
  const showError = touched && Boolean(src.trim()) && !srcValid;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    if (!src.trim() || !srcValid) return;
    onConfirm(src.trim(), alt.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const showPreview = src.trim() && srcValid && !previewFailed;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Insert image"
    >
      <div
        className="bg-popover border-border shadow-xl w-[380px] rounded-lg border p-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon className="text-muted-foreground size-4" />
          <span className="text-sm font-semibold">Insert image</span>
        </div>

        {/* Image URL */}
        <div className="mb-2 space-y-1">
          <label htmlFor="image-dialog-src" className="text-muted-foreground text-xs font-medium">
            Image URL
          </label>
          <Input
            id="image-dialog-src"
            ref={inputRef}
            value={src}
            onChange={(e) => {
              setSrc(e.target.value);
              setTouched(true);
              setPreviewFailed(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/image.png"
            className={cn(showError && 'border-destructive')}
            aria-invalid={showError}
          />
          {showError && (
            <p className="text-destructive text-xs">Please enter a valid image URL.</p>
          )}
        </div>

        {/* Alt text */}
        <div className="mb-3 space-y-1">
          <label htmlFor="image-dialog-alt" className="text-muted-foreground text-xs font-medium">
            Alt text <span className="text-muted-foreground/60">(optional but recommended)</span>
          </label>
          <Input
            id="image-dialog-alt"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the image for screen readers"
          />
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="mb-3 flex items-center justify-center rounded-md border bg-muted/30 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || 'Preview'}
              className="max-h-32 max-w-full rounded object-contain"
              onError={() => setPreviewFailed(true)}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" onClick={handleConfirm} disabled={!src.trim() || !srcValid}>
            Insert image
          </Button>
        </div>
      </div>
    </div>
  );
}
