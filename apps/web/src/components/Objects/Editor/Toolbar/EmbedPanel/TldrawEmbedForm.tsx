'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { validateTldrawUrl } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-validators';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TldrawEmbedFormProps {
  /** Current value of the URL input (controlled). */
  url: string;
  /** Called whenever the user types in the URL input. */
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
 * Controlled URL input form for tldraw share links.
 *
 * - Validates via `validateTldrawUrl` on submit (called by the parent
 *   `EmbedPanel` before inserting the node).
 * - Clears the error whenever the user types (Requirement 6.3 / 4.5 pattern).
 * - Shows an inline error message beneath the input when `error` is non-null.
 *
 * Requirements: 6.1, 6.3, 11.1
 */
export function TldrawEmbedForm({ url, onChange, error, onErrorChange }: TldrawEmbedFormProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel');
  const inputId = useId();
  const errorId = useId();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Clear any existing error as soon as the user starts typing (Req 6.3).
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
        placeholder="https://tldraw.com/r/room-id"
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
export { validateTldrawUrl as validateTldrawEmbedForm };
