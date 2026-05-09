'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { EmojiClickData } from 'emoji-picker-react';
import { Link as LinkIcon, Plus, X } from 'lucide-react';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { generateUUID } from '@/lib/utils';
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => null,
});

interface LearningItem {
  id: string;
  text: string;
  emoji: string;
  link?: string;
}

interface LearningItemsListProps {
  value?: string;
  onChange: (value: string) => void;
  error?: string;
}

const PLACEHOLDER_ID_PREFIX = '__placeholder_';

const LearningItemsList = ({ value, onChange, error }: LearningItemsListProps) => {
  // Helper function to standardize items.
  // Uses deterministic placeholder IDs to avoid SSR/hydration mismatch;
  // real UUIDs are assigned in a post-mount effect.
  const standardizeItems = (val?: string): LearningItem[] => {
    try {
      if (val) {
        const parsedItems = JSON.parse(val);
        if (Array.isArray(parsedItems) && parsedItems.length > 0) {
          return parsedItems.map((item: unknown, index: number) => {
            const safeItem = item as Partial<LearningItem>;
            return {
              id: safeItem.id || `${PLACEHOLDER_ID_PREFIX}${index}`,
              text: safeItem.text ?? '',
              emoji: safeItem.emoji || '📝',
              link: safeItem.link || undefined,
            };
          });
        }
      }
    } catch {
      // Parse error - fall through to default
    }
    // Default item
    return [
      {
        id: `${PLACEHOLDER_ID_PREFIX}0`,
        text: '',
        emoji: '📝',
      },
    ];
  };

  const initialSyncRafRef = useRef<number | null>(null);

  // Use lazy initialization to parse and standardize items once
  const [items, setItems] = useState<LearningItem[]>(() => standardizeItems(value));

  // Replace placeholder IDs with real UUIDs after mount to avoid SSR/hydration mismatch.
  useEffect(() => {
    setItems((prev) => {
      const hasPlaceholders = prev.some((item) => item.id.startsWith(PLACEHOLDER_ID_PREFIX));
      if (!hasPlaceholders) return prev;
      return prev.map((item) => ({
        ...item,
        id: item.id.startsWith(PLACEHOLDER_ID_PREFIX) ? generateUUID() : item.id,
      }));
    });
  }, []);

  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showLinkInput, setShowLinkInput] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const linkInputFieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const focusRafRef = useRef<number | null>(null);
  const emojiFocusRafRef = useRef<number | null>(null);
  const t = useTranslations('CourseEdit.General.LearningItems');

  // Sync back to parent on mount if IDs were generated or value was missing/invalid
  useEffect(() => {
    const needsSync =
      !value ||
      (() => {
        try {
          const parsed = JSON.parse(value);
          return !Array.isArray(parsed) || items.some((item, idx) => item.id !== parsed[idx]?.id);
        } catch {
          return true;
        }
      })();
    if (needsSync) {
      initialSyncRafRef.current = requestAnimationFrame(() => onChange(JSON.stringify(items)));
    }
    return () => {
      if (initialSyncRafRef.current) cancelAnimationFrame(initialSyncRafRef.current);
    };
  }, [onChange, items, value]);

  // Cleanup on unmount - cancel any scheduled animation frames
  useEffect(() => {
    return () => {
      if (focusRafRef.current) cancelAnimationFrame(focusRafRef.current);
      if (emojiFocusRafRef.current) cancelAnimationFrame(emojiFocusRafRef.current);
    };
  }, []);

  // Add a new empty item
  const addItem = () => {
    const newItem: LearningItem = {
      id: generateUUID(),
      text: '',
      emoji: '📝',
    };
    const newItems = [...items, newItem];
    setItems(newItems);
    onChange(JSON.stringify(newItems));

    // Use timeout to ensure DOM has updated
    // Schedule focus/scroll on next animation frame
    if (focusRafRef.current) cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      const inputEl = inputRefs.current[newItem.id];
      if (inputEl) {
        inputEl.focus();
        setFocusedItemId(newItem.id);
      }

      const scrollEl = scrollContainerRef.current;
      if (scrollEl && newItems.length > 5) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    });
  };

  // Remove an item
  const removeItem = (id: string) => {
    if (focusedItemId === id) {
      setFocusedItemId(null);
    }
    const newItems = items.filter((item) => item.id !== id);
    setItems(newItems);
    onChange(JSON.stringify(newItems));
  };

  const updateItemText = (id: string, text: string) => {
    const newItems = items.map((item) => (item.id === id ? { ...item, text } : item));
    setItems(newItems);
    onChange(JSON.stringify(newItems));
  };

  const updateItemEmoji = (id: string, emoji: string) => {
    const newItems = items.map((item) => (item.id === id ? { ...item, emoji } : item));
    setItems(newItems);
    onChange(JSON.stringify(newItems));
    setShowEmojiPicker(null);

    if (emojiFocusRafRef.current) cancelAnimationFrame(emojiFocusRafRef.current);
    emojiFocusRafRef.current = requestAnimationFrame(() => {
      const inputEl = inputRefs.current[id];
      if (inputEl) {
        inputEl.focus();
        setFocusedItemId(id);
      }
    });
  };

  // Update item link
  const updateItemLink = (id: string, link: string) => {
    const newItems = items.map((item) => (item.id === id ? { ...item, link: link.trim() || undefined } : item));
    setItems(newItems);
    onChange(JSON.stringify(newItems));
  };

  // Restore focus after re-render if an item was focused
  useEffect(() => {
    if (!focusedItemId) return;

    if (focusRafRef.current) cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      if (showLinkInput === focusedItemId) {
        linkInputFieldRefs.current[focusedItemId]?.focus();
      } else {
        inputRefs.current[focusedItemId]?.focus();
      }

      // Handle scrolling for long lists
      if (items.length > 5) {
        const scrollEl = scrollContainerRef.current;
        const focusedEl = document.getElementById(`learning-item-${focusedItemId}`);

        if (scrollEl && focusedEl) {
          const containerRect = scrollEl.getBoundingClientRect();
          const elementRect = focusedEl.getBoundingClientRect();

          if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
            focusedEl.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }
        }
      }
    });

    return () => {
      if (focusRafRef.current) cancelAnimationFrame(focusRafRef.current);
    };
  }, [focusedItemId, showLinkInput, items.length]);

  // Handle clicks outside of emoji picker and link input
  const handleClickOutside = useEffectEvent((event: MouseEvent) => {
    const target = event.target as HTMLElement;

    // Close emoji picker if clicking outside
    if (pickerRef.current && !pickerRef.current.contains(target)) {
      setShowEmojiPicker(null);
    }

    // Close link input if clicking outside (but not on the link icon itself)
    if (linkInputRef.current && !linkInputRef.current.contains(target)) {
      const clickedLinkIcon = target.closest('[data-role="link-icon"]');
      const linkInputItemId = target.closest('[data-itemid]')?.getAttribute('data-itemid');

      // Only close if not clicking the link icon for the currently open link input
      if (!clickedLinkIcon || linkInputItemId !== showLinkInput) {
        setShowLinkInput(null);
      }
    }
  });

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleEmojiSelect = (id: string, emojiData: EmojiClickData) => {
    updateItemEmoji(id, emojiData.emoji);
  };

  const handleInputFocus = (id: string) => {
    setFocusedItemId(id);
  };

  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputBlur = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = setTimeout(() => {
      const activeEl = document.activeElement;
      const isStillInComponent =
        activeEl?.classList.contains('learning-item-input') || activeEl?.closest('[data-emoji-picker="true"]');

      if (!isStillInComponent) {
        setShowLinkInput(null);
      }
    }, 100);
  };

  // Ensure blur timeout cleared on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const setInputRef = (id: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[id] = el;
  };

  const setLinkInputRef = (id: string) => (el: HTMLInputElement | null) => {
    linkInputFieldRefs.current[id] = el;
  };

  const isScrollable = items.length > 5;

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="bg-muted/50 text-muted-foreground rounded-lg border py-3 text-center text-sm">
          {t('noItems')}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className={`space-y-2 ${isScrollable ? 'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent max-h-[350px] overflow-y-auto pr-1' : ''}`}
      >
        {items.map((item) => (
          <div
            key={item.id}
            id={`learning-item-${item.id}`}
            className="group relative"
          >
            <div className="border-border bg-muted/50 hover:bg-muted/70 flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors">
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((prev) => (prev === item.id ? null : item.id));
                  setShowLinkInput(null);
                  setFocusedItemId(item.id);
                }}
                className="shrink-0 text-lg transition-transform hover:scale-110"
                aria-label={t('changeEmojiAriaLabel')}
              >
                <span>{item.emoji}</span>
              </button>

              <Input
                ref={setInputRef(item.id)}
                value={item.text}
                onChange={(e) => {
                  updateItemText(item.id, e.target.value);
                }}
                onFocus={() => {
                  handleInputFocus(item.id);
                }}
                onBlur={handleInputBlur}
                placeholder={t('placeholder')}
                className="learning-item-input h-8 grow border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
              />

              {item.link ? (
                <div className="bg-background text-muted-foreground flex items-center gap-1 rounded border px-2 py-0.5 text-xs">
                  <LinkIcon size={12} />
                  <span className="max-w-[100px] truncate">{item.link}</span>
                </div>
              ) : null}

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-itemid={item.id}
                  data-role="link-icon"
                  onClick={() => {
                    const isOpening = showLinkInput !== item.id;
                    setShowLinkInput(isOpening ? item.id : null);
                    setShowEmojiPicker(null);
                    setFocusedItemId(item.id);

                    if (isOpening) {
                      setTimeout(() => {
                        linkInputFieldRefs.current[item.id]?.focus();
                      }, 0);
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={item.link ? t('editLinkTooltip') : t('addLinkTooltip')}
                  aria-label={item.link ? t('editLinkAriaLabel') : t('addLinkAriaLabel')}
                >
                  <LinkIcon size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    removeItem(item.id);
                  }}
                  className="text-muted-foreground/70 hover:text-foreground transition-colors"
                  aria-label={t('removeItemAriaLabel')}
                  title={t('removeItemTooltip')}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {showEmojiPicker === item.id && (
              <div
                ref={pickerRef}
                className="absolute left-0 z-10 mt-1 shadow-lg"
                data-emoji-picker="true"
              >
                <EmojiPicker
                  height="25rem"
                  width="25rem"
                  onEmojiClick={(emoji) => {
                    handleEmojiSelect(item.id, emoji);
                  }}
                  theme={'light' as any}
                  previewConfig={{ showPreview: false }}
                  searchPlaceHolder={t('searchEmojis')}
                  autoFocusSearch
                  skinTonesDisabled
                />
              </div>
            )}

            {showLinkInput === item.id && (
              <div
                ref={linkInputRef}
                className="border-border bg-background mt-1 rounded-lg border p-2 shadow-sm"
              >
                <Input
                  ref={setLinkInputRef(item.id)}
                  type="url"
                  value={item.link || ''}
                  onChange={(e) => {
                    updateItemLink(item.id, e.target.value);
                  }}
                  onFocus={() => {
                    handleInputFocus(item.id);
                  }}
                  onBlur={handleInputBlur}
                  placeholder={t('linkInputPlaceholder')}
                  className="learning-item-input w-full text-sm"
                  aria-label={t('linkInputAriaLabel')}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1.5 text-sm transition-colors"
      >
        <Plus
          size={16}
          className="text-primary"
        />
        <span>{t('addItemButton')}</span>
      </button>
    </div>
  );
};

export default LearningItemsList;
