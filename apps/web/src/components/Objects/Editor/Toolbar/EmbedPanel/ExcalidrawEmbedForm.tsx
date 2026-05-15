'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { validateExcalidrawUrl } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-validators';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ExcalidrawEmbedFormProps {
  /** Current URL value (controlled). */
  url: string;
  /** Called whenever the user changes the input value. Also clears any error. */
  onChange: (url: string) => void;
  /**
   * Current validation error key (`'errorEmpty'` | `'errorInvalid'`) or
   * `null` when there is no error.
   */
  error: string | null;
  /** Called to update the error state from outside (e.g. on submit attempt). */
  onErrorChange: (error: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Controlled URL input form for Excalidraw share links.
 *
 * - Validates via `validateExcalidrawUrl` on submit (called by the parent
 *   `EmbedPanel` before inserting the node).
 * - Clears the error whenever the user types (Requirement 5.3).
 * - Shows an inline error message beneath the input when `error` is non-null.
 *
 * Requirements: 5.1, 5.3, 11.1
 */
export function ExcalidrawEmbedForm({ url, onChange, error, onErrorChange }: ExcalidrawEmbedFormProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const inputId = useId();
  const errorId = useId();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear any existing error as soon as the user starts typing (Req 5.3).
    if (error !== null) {
      onErrorChange(null);
    }
    onChange(e.target.value);
  };

  const hasError = error !== null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{t('urlPlaceholder')}</Label>
      <Input
        id={inputId}
        type="url"
        value={url}
        onChange={handleChange}
        placeholder="https://excalidraw.com/#room=..."
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {hasError && (
        <p
          id={errorId}
          role="alert"
          className="text-destructive text-sm"
        >
          {t(error as 'errorEmpty' | 'errorInvalid')}
        </p>
      )}
    </div>
  );
}

// ── Validation helper (re-exported for EmbedPanel convenience) ────────────────

/**
 * Validates the current URL and returns the error key, or `null` if valid.
 * Intended to be called by the parent `EmbedPanel` on Insert click.
 */
export { validateExcalidrawUrl as validateExcalidrawEmbedForm };
