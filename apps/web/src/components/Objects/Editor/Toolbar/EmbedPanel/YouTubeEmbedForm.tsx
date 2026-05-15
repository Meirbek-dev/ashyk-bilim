'use client';

import { useId } from 'react';
import { YouTubeEmbed } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';
import { parseYouTubeUrl } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-validators';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface YouTubeEmbedFormProps {
  /** Current URL value (controlled). */
  url: string;
  /** Called whenever the input value changes. */
  onChange: (url: string) => void;
  /** Current validation error key, or `null` when there is no error. */
  error: string | null;
  /** Called to update the error state. Pass `null` to clear the error. */
  onErrorChange: (error: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * YouTubeEmbedForm
 *
 * Controlled form for entering a YouTube video URL.
 *
 * - Shows a live `<YouTubeEmbed>` preview when the URL is valid.
 * - Displays an inline error (`errorEmpty` or `errorInvalid`) below the input
 *   when the parent signals a validation failure.
 * - Clears the error on every keystroke (Requirement 4.5).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 11.1
 */
export function YouTubeEmbedForm({ url, onChange, error, onErrorChange }: YouTubeEmbedFormProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const inputId = useId();
  const errorId = useId();

  // Derive the live preview video ID from the current URL value.
  // `parseYouTubeUrl` returns `null` for empty / invalid URLs.
  const previewVideoId = parseYouTubeUrl(url);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear any existing error as soon as the user types (Requirement 4.5).
    if (error !== null) {
      onErrorChange(null);
    }
    onChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* URL input */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-sm leading-none font-medium"
        >
          {t('urlPlaceholder')}
        </label>
        <input
          id={inputId}
          type="url"
          autoComplete="url"
          placeholder={t('urlPlaceholder')}
          value={url}
          onChange={handleChange}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
          className={[
            'border-input bg-background text-foreground placeholder:text-muted-foreground',
            'focus:border-primary focus:ring-primary/30 w-full rounded-md border px-3 py-2 text-sm',
            'focus:ring-1 focus:outline-none transition-colors',
            error !== null ? 'border-destructive focus:border-destructive focus:ring-destructive/30' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />

        {/* Inline validation error (Requirement 4.6) */}
        {error !== null && (
          <p
            id={errorId}
            role="alert"
            className="text-destructive text-sm font-normal"
          >
            {t(error as 'errorEmpty' | 'errorInvalid')}
          </p>
        )}
      </div>

      {/* Live preview — only shown when the URL is valid (Requirement 4.3) */}
      {previewVideoId !== null && (
        <div className="overflow-hidden rounded-md">
          {/* 16:9 responsive container matching YouTubeNodeView (Requirement 4.7) */}
          <div className="aspect-video w-full overflow-hidden rounded-md">
            <YouTubeEmbed
              videoid={previewVideoId}
              style="height: 100%; width: 100%; max-width: none;"
              params="rel=0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
