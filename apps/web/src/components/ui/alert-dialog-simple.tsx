'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslations } from 'next-intl';

interface SimpleAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  okLabel?: string;
}

export default function SimpleAlertDialog({ open, onOpenChange, title, description, okLabel }: SimpleAlertDialogProps) {
  const t = useTranslations('Components.AlertDialog');
  const resolvedOk = okLabel ?? t('ok');
  const resolvedTitle = title ?? t('title');

  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent size="sm">
        <AlertDialogTitle>{resolvedTitle}</AlertDialogTitle>
        {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        <div className="mt-4 flex justify-end">
          <AlertDialogAction onClick={() => onOpenChange(false)}>{resolvedOk}</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
