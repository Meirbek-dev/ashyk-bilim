import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Maximize2,
  Minimize2,
  Palette,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { twMerge } from 'tailwind-merge';

// ============================================================================
// Types
// ============================================================================

type Alignment = 'left' | 'center' | 'right';
type Size = 'small' | 'medium' | 'large';
type CardColor = 'sky' | 'green' | 'yellow' | 'red' | 'purple' | 'teal' | 'amber' | 'indigo' | 'neutral' | 'blue';

interface FlipcardAttrs {
  question: string;
  answer: string;
  color: CardColor;
  alignment: Alignment;
  size: Size;
}

// ============================================================================
// Constants
// ============================================================================

const CARD_COLORS: CardColor[] = [
  'blue',
  'sky',
  'teal',
  'green',
  'yellow',
  'amber',
  'red',
  'purple',
  'indigo',
  'neutral',
];

const SIZE_CONFIG = {
  small: { container: 'w-64 h-40', font: 'text-sm', icon: 16 },
  medium: { container: 'w-80 h-52', font: 'text-base', icon: 18 },
  large: { container: 'w-96 h-64', font: 'text-lg', icon: 20 },
} as const;

const COLOR_CONFIG: Record<CardColor, { front: string; back: string; swatch: string }> = {
  sky: {
    front: 'bg-sky-500 border-sky-400/50',
    back: 'bg-sky-600 border-sky-500/50',
    swatch: 'bg-sky-500',
  },
  green: {
    front: 'bg-emerald-500 border-emerald-400/50',
    back: 'bg-emerald-600 border-emerald-500/50',
    swatch: 'bg-emerald-500',
  },
  yellow: {
    front: 'bg-yellow-500 border-yellow-400/50',
    back: 'bg-yellow-600 border-yellow-500/50',
    swatch: 'bg-yellow-500',
  },
  red: {
    front: 'bg-rose-500 border-rose-400/50',
    back: 'bg-rose-600 border-rose-500/50',
    swatch: 'bg-rose-500',
  },
  purple: {
    front: 'bg-purple-500 border-purple-400/50',
    back: 'bg-purple-600 border-purple-500/50',
    swatch: 'bg-purple-500',
  },
  teal: {
    front: 'bg-teal-500 border-teal-400/50',
    back: 'bg-teal-600 border-teal-500/50',
    swatch: 'bg-teal-500',
  },
  amber: {
    front: 'bg-amber-500 border-amber-400/50',
    back: 'bg-amber-600 border-amber-500/50',
    swatch: 'bg-amber-500',
  },
  indigo: {
    front: 'bg-indigo-500 border-indigo-400/50',
    back: 'bg-indigo-600 border-indigo-500/50',
    swatch: 'bg-indigo-500',
  },
  neutral: {
    front: 'bg-neutral-500 border-neutral-400/50',
    back: 'bg-neutral-600 border-neutral-500/50',
    swatch: 'bg-neutral-500',
  },
  blue: {
    front: 'bg-blue-500 border-blue-400/50',
    back: 'bg-blue-600 border-blue-500/50',
    swatch: 'bg-blue-500',
  },
};

const ALIGNMENT_CONFIG = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const;

// ============================================================================
// Hooks
// ============================================================================

function useClickOutside<T extends HTMLElement>(ref: React.RefObject<T | null>, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const listener = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current || ref.current.contains(target)) return;
      // Ignore clicks on flipcard UI elements
      if ((target as HTMLElement).closest?.('[data-flipcard-ui]')) return;
      handlerRef.current();
    };

    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, enabled]);
}

// ============================================================================
// Sub-components
// ============================================================================

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success';
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ active, onClick, title, children, variant = 'default' }) => {
  const baseClasses =
    'rounded-md p-1.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';

  const variantClasses = {
    default: active
      ? 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
    primary: active
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      : 'bg-gray-100 text-gray-600 hover:bg-blue-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/50',
    success: active
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
      : 'bg-gray-100 text-gray-600 hover:bg-emerald-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-emerald-900/50',
  };

  return (
    <button
      type="button"
      data-flipcard-ui
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      onMouseDown={(e) => e.preventDefault()}
      className={twMerge(baseClasses, variantClasses[variant])}
      title={title}
    >
      {children}
    </button>
  );
};

const ToolbarDivider: React.FC = () => <div className="mx-1 h-5 w-px self-center bg-gray-300 dark:bg-gray-600" />;

interface ColorPickerProps {
  currentColor: CardColor;
  onSelect: (color: CardColor) => void;
  onClose: () => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ currentColor, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div
      ref={ref}
      data-flipcard-ui
      className="absolute top-full left-1/2 z-20 mt-2 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-800"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-5 gap-2">
        {CARD_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            data-flipcard-ui
            className={twMerge(
              'flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110',
              COLOR_CONFIG[c].swatch,
              currentColor === c && 'ring-2 ring-gray-400 ring-offset-2 dark:ring-offset-gray-800',
            )}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(c);
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {currentColor === c && (
              <Check
                size={14}
                className="text-white"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

interface CardFaceProps {
  content: string;
  placeholder: string;
  isEditing: boolean;
  isEditable: boolean;
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fontClass: string;
  hint: string;
  iconSize: number;
  isBack?: boolean;
}

const CardFace: React.FC<CardFaceProps> = ({
  content,
  placeholder,
  isEditing,
  isEditable,
  onStartEdit,
  onChange,
  onBlur,
  inputRef,
  fontClass,
  hint,
  iconSize,
  isBack,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onBlur();
    }
    // Prevent flip on Enter when editing
    if (e.key === 'Enter' && !e.shiftKey) {
      e.stopPropagation();
    }
  };

  return (
    <div className="flex h-full flex-col p-5">
      {/* Flip indicator */}
      <div className="pointer-events-none flex justify-center opacity-60 select-none">
        <RotateCcw
          size={iconSize}
          className={isBack ? 'rotate-180' : ''}
        />
      </div>

      {/* Content area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden py-3">
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={twMerge(
              'h-full w-full resize-none rounded-lg border-none bg-white/20 p-3 text-center text-white placeholder-white/60 backdrop-blur-sm outline-none',
              fontClass,
            )}
            placeholder={placeholder}
          />
        ) : (
          <p
            className={twMerge(
              'line-clamp-4 overflow-hidden text-center leading-relaxed text-white select-none',
              fontClass,
              isEditable && 'cursor-text',
            )}
            onMouseDown={(e) => {
              // Prevent placing the editor caret inside the flipcard when in read-only mode
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onClick={(e) => {
              // Prevent click-based focus/selection in read-only mode
              if (!isEditable) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDoubleClick={(e) => {
              if (isEditable) {
                e.stopPropagation();
                e.preventDefault();
                onStartEdit();
              } else {
                // Prevent text selection when double-clicking in read-only mode
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {content || <span className="italic opacity-60">{placeholder}</span>}
          </p>
        )}
      </div>

      {/* Hint text */}
      <div className="pointer-events-none text-center text-xs text-white/60 select-none">
        {isEditing ? '' : isEditable ? hint : hint.split('•')[0]}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const FlipcardExtension: React.FC<ReactNodeViewProps> = ({ node, updateAttributes }) => {
  const attrs = node.attrs as FlipcardAttrs;
  const { question, answer, color, alignment, size } = attrs;

  const t = useTranslations('DashPage.Editor.Flipcard');
  const editorState = useEditorProvider() as { isEditable: boolean };
  const { isEditable } = editorState;

  const [isFlipped, setIsFlipped] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editingFace, setEditingFace] = useState<'question' | 'answer' | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(true);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Derived values
  const sizeConfig = SIZE_CONFIG[size];
  const colorConfig = COLOR_CONFIG[color];
  const alignmentClass = ALIGNMENT_CONFIG[alignment];

  // Handlers
  const handleFlip = useCallback(() => {
    if (editingFace) return;
    setIsFlipped((prev) => !prev);
  }, [editingFace]);

  const updateAttr = useCallback(
    <K extends keyof FlipcardAttrs>(key: K, value: FlipcardAttrs[K]) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const handleStartEdit = useCallback(
    (face: 'question' | 'answer') => {
      if (!isEditable) return;
      setEditingFace(face);

      // Use setTimeout to ensure state update is processed
      setTimeout(() => {
        if (!isMountedRef.current) return;
        const ref = face === 'question' ? questionInputRef : answerInputRef;
        ref.current?.focus();
        ref.current?.select();
      }, 0);
    },
    [isEditable],
  );

  const handleStopEdit = useCallback(() => {
    setEditingFace(null);
  }, []);

  // Handle card keyboard navigation (only when card is focused)
  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't flip via keyboard while editing a face or when in editor (teacher) mode
      if (editingFace || isEditable) return;

      // Allow Space/Enter to flip the card
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        setIsFlipped((prev) => !prev);
        return;
      }

      // Prevent navigation keys from moving the editor caret into the node
      const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
      if (navKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Prevent printable characters from being inserted into the editor while the card is focused.
      // This stops users from typing when `isEditable` is false (read-only), which previously
      // produced transient input that wasn't saved in the flipcard attributes.
      const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ';
      if (isPrintable) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    },
    [editingFace, isEditable],
  );

  // Handle card click
  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't flip if clicking on UI elements or while editing / in editor (teacher) mode
      if (editingFace || isEditable || (e.target as HTMLElement).closest('[data-flipcard-ui]')) {
        return;
      }

      // Prevent the editor from taking focus and ensure the card itself receives focus
      e.preventDefault();
      e.stopPropagation();
      cardRef.current?.focus();

      handleFlip();
    },
    [editingFace, isEditable, handleFlip],
  );

  return (
    <NodeViewWrapper className={twMerge('my-4 flex', alignmentClass)}>
      <div className="group relative inline-flex flex-col items-center">
        {/* Card */}
        <div
          ref={cardRef}
          className={twMerge('[perspective:1000px]', sizeConfig.container)}
          tabIndex={isEditable ? -1 : 0}
          role="button"
          aria-disabled={isEditable}
          aria-label={isFlipped ? t('showQuestion') : t('showAnswer')}
          onMouseDown={(e) => {
            // Prevent the editor from taking focus when the card is clicked, but allow clicks on flipcard UI controls.
            if ((e.target as HTMLElement).closest?.('[data-flipcard-ui]')) return;
            e.preventDefault();
          }}
          onClick={handleCardClick}
          onKeyDown={handleCardKeyDown}
        >
          <div
            className={twMerge(
              'relative h-full w-full transition-transform duration-500',
              '[transform-style:preserve-3d]',
              isFlipped && '[transform:rotateY(180deg)]',
            )}
          >
            {/* Front (Question) */}
            <div
              className={twMerge(
                'absolute inset-0 rounded-2xl border-2 shadow-lg [backface-visibility:hidden]',
                colorConfig.front,
              )}
            >
              <CardFace
                content={question}
                placeholder={t('enterQuestionPlaceholder')}
                isEditing={editingFace === 'question'}
                isEditable={isEditable}
                onStartEdit={() => handleStartEdit('question')}
                onChange={(v) => updateAttr('question', v)}
                onBlur={handleStopEdit}
                inputRef={questionInputRef}
                fontClass={sizeConfig.font}
                hint={isEditable ? `${t('clickToFlip')} • ${t('doubleClickToEdit')}` : t('clickToFlip')}
                iconSize={sizeConfig.icon}
              />
            </div>

            {/* Back (Answer) */}
            <div
              className={twMerge(
                'absolute inset-0 rounded-2xl border-2 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]',
                colorConfig.back,
              )}
            >
              <CardFace
                content={answer}
                placeholder={t('enterAnswerPlaceholder')}
                isEditing={editingFace === 'answer'}
                isEditable={isEditable}
                onStartEdit={() => handleStartEdit('answer')}
                onChange={(v) => updateAttr('answer', v)}
                onBlur={handleStopEdit}
                inputRef={answerInputRef}
                fontClass={sizeConfig.font}
                hint={isEditable ? `${t('clickToFlipBack')} • ${t('doubleClickToEdit')}` : t('clickToFlipBack')}
                iconSize={sizeConfig.icon}
                isBack
              />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        {isEditable && (
          <div
            data-flipcard-ui
            className={twMerge(
              'mt-3 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm backdrop-blur-sm transition-opacity dark:border-gray-700 dark:bg-gray-800/90',
              'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            )}
            contentEditable={false}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Alignment */}
            <ToolbarButton
              active={alignment === 'left'}
              onClick={() => updateAttr('alignment', 'left')}
              title={t('alignLeft')}
              variant="primary"
            >
              <AlignLeft size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={alignment === 'center'}
              onClick={() => updateAttr('alignment', 'center')}
              title={t('alignCenter')}
              variant="primary"
            >
              <AlignCenter size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={alignment === 'right'}
              onClick={() => updateAttr('alignment', 'right')}
              title={t('alignRight')}
              variant="primary"
            >
              <AlignRight size={14} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Size */}
            <ToolbarButton
              active={size === 'small'}
              onClick={() => updateAttr('size', 'small')}
              title={t('smallSize')}
              variant="success"
            >
              <Minimize2 size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={size === 'medium'}
              onClick={() => updateAttr('size', 'medium')}
              title={t('mediumSize')}
              variant="success"
            >
              <Square size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={size === 'large'}
              onClick={() => updateAttr('size', 'large')}
              title={t('largeSize')}
              variant="success"
            >
              <Maximize2 size={14} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Color & Flip */}
            <div className="relative">
              <ToolbarButton
                active={showColorPicker}
                onClick={() => setShowColorPicker((prev) => !prev)}
                title={t('changeColor')}
              >
                <Palette size={14} />
              </ToolbarButton>
              {showColorPicker && (
                <ColorPicker
                  currentColor={color}
                  onSelect={(c) => {
                    updateAttr('color', c);
                    setShowColorPicker(false);
                  }}
                  onClose={() => setShowColorPicker(false)}
                />
              )}
            </div>
            <ToolbarButton
              onClick={() => setIsFlipped((prev) => !prev)}
              title={t('previewFlip')}
            >
              <RotateCcw size={14} />
            </ToolbarButton>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export default FlipcardExtension;
