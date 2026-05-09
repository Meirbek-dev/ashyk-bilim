'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog';
import type { ReactElement, ReactNode } from 'react';
import { Button } from '@components/ui/button';
import { useTranslations } from 'next-intl';
import { isValidElement } from 'react';
import { cn } from '@/lib/utils';

interface ModalParams {
  dialogTitle?: string;
  dialogDescription?: string;
  dialogContent: ReactNode;
  dialogClose?: ReactNode | null;
  dialogTrigger?: ReactElement;
  addDefCloseButton?: boolean;
  onOpenChange: (open: boolean) => void;
  isDialogOpen?: boolean;
  minHeight?: 'sm' | 'md' | 'lg' | 'xl' | 'no-min';
  minWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'no-min';
  customHeight?: string;
  customWidth?: string;
}

const Modal = (params: ModalParams) => {
  const t = useTranslations('Components.Modal');

  const getMinHeight = () => {
    switch (params.minHeight) {
      case 'sm': {
        return 'md:min-h-[300px]';
      }
      case 'md': {
        return 'md:min-h-[500px]';
      }
      case 'lg': {
        return 'md:min-h-[700px]';
      }
      case 'xl': {
        return 'md:min-h-[900px]';
      }
      default: {
        return '';
      }
    }
  };

  const getMinWidth = () => {
    switch (params.minWidth) {
      case 'sm': {
        return 'md:min-w-[600px]';
      }
      case 'md': {
        return 'md:min-w-[800px]';
      }
      case 'lg': {
        return 'md:min-w-[1000px]';
      }
      case 'xl': {
        return 'md:min-w-[1200px]';
      }
      default: {
        return '';
      }
    }
  };

  return (
    <Dialog
      open={params.isDialogOpen ?? false}
      onOpenChange={params.onOpenChange}
    >
      {params.dialogTrigger ? (
        <DialogTrigger
          // Mark as native when the trigger is a real <button> element or when
          // the trigger is our local `Button` component (which renders a native
          // <button>). This avoids Base UI runtime warnings about mismatched
          // render types.
          nativeButton={
            isValidElement(params.dialogTrigger) &&
            (params.dialogTrigger.type === 'button' || params.dialogTrigger.type === Button)
          }
          render={params.dialogTrigger}
        />
      ) : null}
      <DialogContent
        className={cn(
          'overflow-auto',
          'w-[95vw] max-w-[95vw]',
          'max-h-[90vh]',
          'p-4',
          // Tablet and up
          'md:w-auto md:max-w-[90vw] md:p-6',
          getMinHeight(),
          getMinWidth(),
          params.customHeight,
          params.customWidth,
        )}
      >
        <DialogHeader className="flex w-full flex-col space-y-0.5 text-center">
          {params.dialogTitle ? (
            <DialogTitle>{params.dialogTitle}</DialogTitle>
          ) : (
            <DialogTitle>{t('dialog')}</DialogTitle>
          )}
          {params.dialogDescription ? <DialogDescription>{params.dialogDescription}</DialogDescription> : null}
        </DialogHeader>
        <div>{params.dialogContent}</div>
        {params.dialogClose || params.addDefCloseButton ? (
          <DialogFooter>
            {params.dialogClose}
            {params.addDefCloseButton ? (
              <Button
                type="submit"
                aria-label={t('aria.closeModal')}
                className="transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                {t('closeButtonDefault')}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default Modal;
