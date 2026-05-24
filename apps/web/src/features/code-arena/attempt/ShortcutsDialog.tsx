'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  ['Run tests', 'Ctrl', 'Enter'],
  ['Submit', 'Ctrl', 'Shift', 'Enter'],
  ['Command palette', 'Ctrl', 'K'],
  ['Shortcuts', 'Ctrl', '/'],
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map(([label, ...keys]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm"
            >
              <span>{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
