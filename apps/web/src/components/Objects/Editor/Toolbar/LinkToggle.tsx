'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { useEffect, useRef, useState } from 'react';
import LinkInputTooltip from '../Toolbar/LinkInputTooltip';

interface LinkToggleProps {
  editor: Editor;
  isLink: boolean;
  linkHref: string;
}

export function LinkToggle({ editor, isLink, linkHref }: LinkToggleProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const linkSelectionRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (linkSelectionRafRef.current) {
        cancelAnimationFrame(linkSelectionRafRef.current);
      }
    };
  }, []);

  const handleLinkClick = () => {
    const { from, to } = editor.state.selection;
    setShowLinkInput(true);
    if (linkSelectionRafRef.current) cancelAnimationFrame(linkSelectionRafRef.current);
    linkSelectionRafRef.current = requestAnimationFrame(() => {
      editor.commands.setTextSelection({ from, to });
    });
  };

  const handleLinkSave = (url: string) => {
    editor.chain().focus().setLink({ href: url, target: '_blank', rel: 'noopener noreferrer' }).run();
    setShowLinkInput(false);
  };

  return (
    <div className="relative">
      <Toggle
        size="sm"
        pressed={isLink}
        onPressedChange={(pressed) => {
          if (!pressed && isLink) {
            editor.chain().focus().unsetLink().run();
            setShowLinkInput(false);
            return;
          }
          handleLinkClick();
        }}
        aria-label={t('link')}
        title={`${t('link')} (Ctrl+K)`}
      >
        <Link2 />
      </Toggle>
      {showLinkInput ? (
        <LinkInputTooltip
          onSave={handleLinkSave}
          onCancel={() => setShowLinkInput(false)}
          currentUrl={linkHref}
        />
      ) : null}
    </div>
  );
}
