'use client';

import { SiYoutube } from '@icons-pack/react-simple-icons';
import { Globe, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { EmbedType } from './EmbedPanelStore';

// ── Props ─────────────────────────────────────────────────────────────────────

interface EmbedTypeSelectorProps {
  /** Currently selected embed type, or null if none selected yet. */
  selectedType: EmbedType | null;
  /** Called when the user clicks a card. */
  onSelect: (type: EmbedType) => void;
  /** Inline validation error shown below the cards (e.g. "Please select a type"). */
  error?: string | null;
}

// ── Card config ───────────────────────────────────────────────────────────────

interface EmbedTypeCard {
  type: EmbedType;
  labelKey: 'youtubeLabel' | 'excalidrawLabel' | 'tldrawLabel';
  icon: React.ReactNode;
}

const EMBED_TYPE_CARDS: EmbedTypeCard[] = [
  {
    type: 'youtube',
    labelKey: 'youtubeLabel',
    icon: <SiYoutube className="size-6 text-[#FF0000]" />,
  },
  {
    type: 'excalidraw',
    labelKey: 'excalidrawLabel',
    icon: <PenLine className="size-6 text-violet-500" />,
  },
  {
    type: 'tldraw',
    labelKey: 'tldrawLabel',
    icon: <Globe className="size-6 text-blue-500" />,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders three selectable cards — YouTube, Excalidraw, tldraw — for the
 * Embed Panel type selection step.
 *
 * This is a controlled component: the parent owns `selectedType` and
 * `onSelect`. An optional `error` string is displayed below the cards when
 * the user attempts to insert without selecting a type (Requirement 3.5).
 */
export function EmbedTypeSelector({ selectedType, onSelect, error }: EmbedTypeSelectorProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel');

  return (
    <div className="flex flex-col gap-2">
      {/* Card row */}
      <div
        role="radiogroup"
        aria-label={t('youtubeLabel')}
        className="grid grid-cols-3 gap-3"
      >
        {EMBED_TYPE_CARDS.map(({ type, labelKey, icon }) => {
          const isSelected = selectedType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(type)}
              className={cn(
                // Base card styles
                'flex flex-col items-center justify-center gap-2 rounded-xl border px-4 py-5 text-sm font-medium transition-all',
                'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                // Unselected state
                'border-border bg-background text-muted-foreground',
                // Selected state — highlighted border + background tint
                isSelected && 'border-primary bg-primary/5 text-foreground ring-2 ring-primary/20',
                // Error state — show destructive border when no type selected and error present
                !isSelected && error && 'border-destructive/50',
              )}
            >
              {icon}
              <span>{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Inline validation error */}
      {error ? (
        <p
          role="alert"
          className="text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
