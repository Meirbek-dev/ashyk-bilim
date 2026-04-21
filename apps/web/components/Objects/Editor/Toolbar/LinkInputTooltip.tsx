import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

interface LinkInputTooltipProps {
  onSave: (url: string) => void;
  onCancel: () => void;
  currentUrl?: string;
}

const LinkInputTooltip = ({ onSave, onCancel, currentUrl = '' }: LinkInputTooltipProps) => {
  const [url, setUrl] = useState(currentUrl);
  const t = useTranslations('DashPage.Editor.LinkInputTooltip');

  const handleSubmit = (formData: FormData) => {
    const nextUrl = String(formData.get('url') ?? '').trim();

    if (nextUrl) {
      // Ensure the URL has a protocol
      const formattedUrl =
        nextUrl.startsWith('http://') || nextUrl.startsWith('https://') ? nextUrl : `https://${nextUrl}`;
      onSave(formattedUrl);
    }
  };

  const inputId = useId();

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="border-border bg-popover absolute top-full left-0 z-[1000] mt-1.5 rounded-lg border p-2 shadow-md">
      <form
        action={handleSubmit}
        className="flex items-center gap-1.5"
      >
        <label
          htmlFor={inputId}
          className="sr-only"
        >
          {t('enterUrl')}
        </label>
        <input
          id={inputId}
          name="url"
          type="text"
          autoComplete="url"
          placeholder={t('enterUrl')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/30 w-52 rounded-md border px-2.5 py-1 text-xs focus:ring-1 focus:outline-none"
        />
        <div className="flex gap-1">
          <button
            type="submit"
            disabled={!url.trim()}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center justify-center rounded-md p-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
            title={t('saveLink')}
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center rounded-md p-1 transition-colors"
            title={t('cancel')}
          >
            <X size={16} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default LinkInputTooltip;
