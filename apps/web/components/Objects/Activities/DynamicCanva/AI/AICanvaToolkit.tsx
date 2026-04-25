import { AlertTriangle, BookOpen, Check, FormInput, Languages, Loader2 } from 'lucide-react';
import { useActivityAIChat } from '@components/Contexts/AI/ActivityAIChatContext';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import platformLogo from '@public/platform_logo.svg';
import platformLogoLight from '@public/platform_logo_light.svg';
import { BubbleMenu } from '@tiptap/react/menus';
import { Button } from '@components/ui/button';
import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/providers/theme-provider';
import type { ReactNode } from 'react';
import { useState } from 'react';
import Image from 'next/image';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionLabel = 'Explain' | 'Summarize' | 'Translate' | 'Examples';
type ActionState = 'idle' | 'loading' | 'done' | 'error';

interface AICanvaToolkitProps {
  editor: Editor;
  activity: { activity_uuid: string };
}

// ── Toolkit Container ─────────────────────────────────────────────────────────

const AICanvaToolkit = (props: AICanvaToolkitProps) => {
  const t = useTranslations('Activities.AICanvaToolkit');
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoLight : platformLogo;

  if (!props.editor) {
    return null;
  }

  return (
    <BubbleMenu
      className="w-fit"
      editor={props.editor}
      shouldShow={({ state }: { editor: Editor; state: Editor['state'] }) => {
        return !state.selection.empty && !('node' in state.selection);
      }}
    >
      <div className="border-border bg-popover flex h-auto w-max items-center gap-2 rounded-lg border px-3 py-1.5 shadow-md">
        <div className="flex items-center gap-1.5">
          <Image
            className="rounded-sm"
            width={18}
            src={logoSrc}
            alt={t('aiIconAlt')}
            style={{ height: 'auto' }}
          />
          <span className="text-foreground text-xs font-semibold">{t('aiTitle')}</span>
        </div>
        <div
          className="bg-border h-4 w-px"
          aria-hidden="true"
        />
        <div className="flex items-center gap-0.5">
          <AIActionButton
            editor={props.editor}
            label="Explain"
          />
          <AIActionButton
            editor={props.editor}
            label="Summarize"
          />
          <AIActionButton
            editor={props.editor}
            label="Translate"
          />
          <AIActionButton
            editor={props.editor}
            label="Examples"
          />
        </div>
      </div>
    </BubbleMenu>
  );
};

// ── Action Button ─────────────────────────────────────────────────────────────

const AIActionButton = (props: { editor: Editor; label: ActionLabel }) => {
  const t = useTranslations('Activities.AICanvaToolkit');
  const { sendMessage, setIsModalOpen } = useActivityAIChat();
  const [actionState, setActionState] = useState<ActionState>('idle');

  async function handleAction(label: ActionLabel) {
    if (actionState === 'loading') return;
    setActionState('loading');
    try {
      const selection = getTipTapEditorSelectedText();
      if (!selection.trim()) {
        setActionState('idle');
        return;
      }
      const prompt = getPrompt(label, selection);
      if (!prompt) {
        setActionState('idle');
        return;
      }
      setIsModalOpen(true);
      await sendMessage(prompt);
      setActionState('done');
    } catch {
      setActionState('error');
    } finally {
      setTimeout(() => setActionState('idle'), 1500);
    }
  }

  const getTipTapEditorSelectedText = () => {
    const { selection } = props.editor.state;
    const { from, to } = selection;
    return props.editor.state.doc.textBetween(from, to);
  };

  const getPrompt = (label: ActionLabel, selection: string): string => {
    switch (label) {
      case 'Explain': {
        return t('explainPrompt', { selection });
      }
      case 'Summarize': {
        return t('summarizePrompt', { selection });
      }
      case 'Translate': {
        return t('translatePrompt', { selection });
      }
      case 'Examples': {
        return t('examplesPrompt', { selection });
      }
    }
  };

  const getTooltipLabel = (label: ActionLabel): string => {
    switch (label) {
      case 'Explain': {
        return t('explainTooltip');
      }
      case 'Summarize': {
        return t('summarizeTooltip');
      }
      case 'Translate': {
        return t('translateTooltip');
      }
      case 'Examples': {
        return t('examplesTooltip');
      }
    }
  };

  const getButtonLabel = (label: ActionLabel): string => {
    switch (label) {
      case 'Explain': {
        return t('explainLabel');
      }
      case 'Summarize': {
        return t('summarizeLabel');
      }
      case 'Translate': {
        return t('translateLabel');
      }
      case 'Examples': {
        return t('examplesLabel');
      }
    }
  };

  const iconMap: Record<ActionLabel, ReactNode> = {
    Explain: <BookOpen size={13} />,
    Summarize: <FormInput size={13} />,
    Translate: <Languages size={13} />,
    Examples: <span className="text-xs leading-none font-bold">{t('examplesAbbr')}</span>,
  };

  const isLoading = actionState === 'loading';
  const isDone = actionState === 'done';
  const isError = actionState === 'error';

  return (
    <ToolTip
      sideOffset={10}
      slateBlack
      content={getTooltipLabel(props.label)}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleAction(props.label)}
        aria-label={getButtonLabel(props.label)}
        disabled={isLoading}
        className="text-muted-foreground hover:bg-muted hover:text-foreground h-7 gap-1.5 rounded-md px-2 text-xs font-medium disabled:opacity-60"
        type="button"
      >
        {isLoading ? (
          <Loader2
            size={13}
            className="animate-spin"
          />
        ) : isDone ? (
          <Check
            size={13}
            className="text-emerald-400"
          />
        ) : isError ? (
          <AlertTriangle
            size={13}
            className="text-red-400"
          />
        ) : (
          iconMap[props.label]
        )}
        {getButtonLabel(props.label)}
      </Button>
    </ToolTip>
  );
};

export default AICanvaToolkit;
