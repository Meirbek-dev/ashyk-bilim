'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutRow {
  key: string;
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { key: 'O', description: 'Toggle course outline' },
  { key: 'F', description: 'Toggle focus mode' },
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'Esc', description: 'Close panels or exit focus mode' },
  { key: 'Left', description: 'Previous activity' },
  { key: 'Right', description: 'Next activity' },
];

export default function KeyboardShortcutsModal() {
  const t = useTranslations('ActivityPage');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === '?' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !isTypingTarget(event.target)
      ) {
        setOpen((value) => !value);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('keyboardShortcuts')}</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map((shortcut) => (
                <tr
                  key={shortcut.key}
                  className="border-border border-b last:border-0"
                >
                  <td className="py-2 pr-4 font-mono">
                    <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs font-semibold">
                      {shortcut.key}
                    </kbd>
                  </td>
                  <td className="text-muted-foreground py-2">{shortcut.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
