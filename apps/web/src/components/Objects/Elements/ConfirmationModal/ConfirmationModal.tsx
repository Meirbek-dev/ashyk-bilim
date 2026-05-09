'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { isValidElement, useState, useTransition } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for the ConfirmationModal component
 */
interface ModalParams {
  /** The message displayed in the modal body */
  confirmationMessage: string;
  /** Text for the confirm/action button */
  confirmationButtonText: string;
  /** Title displayed in the modal header */
  dialogTitle: string;
  /** Function to execute when the confirmation button is clicked */
  functionToExecute: () => void | Promise<void>;
  /** ReactNode that triggers the modal when clicked */
  dialogTrigger?: ReactNode;
  /** Visual style of the modal - 'warning' for destructive actions, 'info' for general confirmations */
  status?: 'warning' | 'info';
  /** Optional ID for the confirmation button */
  buttonid?: string;
  /** Text for the cancel button */
  cancelButtonText?: string;
  /** Whether to show the cancel button (default: true) */
  showCancelButton?: boolean;
  /** Size of the modal dialog */
  size?: 'sm' | 'md' | 'lg';
  /** Whether the confirmation button is disabled */
  disabled?: boolean;
}

const ConfirmationModal = (params: ModalParams) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('Components.ConfirmationModal');

  function onOpenChange(open: boolean) {
    // allow opening/closing while a transition is pending so users can cancel/close the dialog
    setIsDialogOpen(open);
  }

  // Helper: wrap button in span if needed for proper DialogTrigger usage
  function getSafeDialogTrigger(trigger: ReactNode): ReactElement | undefined {
    if (!trigger) return undefined;
    if (isValidElement(trigger)) {
      const type = (trigger.type as any)?.toString?.() || '';
      // If already span/div, return as is
      if (type.includes('span') || type.includes('div')) return trigger;
      // If button, wrap in span
      if (type.includes('button')) return <span>{trigger}</span>;
      return trigger;
    }
    return <span>{trigger}</span>;
  }

  const triggerElement = getSafeDialogTrigger(params.dialogTrigger);

  const triggerIsNativeButton = Boolean(
    triggerElement &&
    isValidElement(triggerElement) &&
    typeof triggerElement.type === 'string' &&
    triggerElement.type === 'button',
  );

  function getStatusConfig() {
    const isWarning = params.status === 'warning';
    return {
      iconBg: isWarning
        ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400',
      buttonVariant: isWarning ? 'destructive' : 'default',
      icon: isWarning ? AlertTriangle : Info,
    };
  }

  function getSizeConfig() {
    switch (params.size) {
      case 'sm': {
        return 'sm:max-w-sm';
      }
      case 'lg': {
        return 'sm:max-w-lg';
      }
      default: {
        return 'sm:max-w-md';
      }
    }
  }

  function handleExecute() {
    if (params.disabled || isPending) return;

    // Use startTransition to mark the UI work as non-urgent and show pending state
    startTransition(() => {
      // run the async operation. we still handle errors but don't block UI updates
      void (async () => {
        try {
          await params.functionToExecute();
          // close dialog as a state update inside the transition
          setIsDialogOpen(false);
        } catch (error) {
          console.error('Error executing confirmation action:', error);
          // Keep modal open on error so user can retry
        }
      })();
    });
  }

  const statusConfig = getStatusConfig();
  const sizeConfig = getSizeConfig();
  const Icon = statusConfig.icon;

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={onOpenChange}
    >
      {params.dialogTrigger ? (
        <DialogTrigger
          nativeButton={triggerIsNativeButton}
          render={triggerElement}
        />
      ) : null}
      <DialogContent
        className={cn(sizeConfig)}
        aria-describedby="confirmation-description"
      >
        <DialogHeader className="pb-0">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors',
                statusConfig.iconBg,
              )}
              aria-hidden="true"
            >
              <Icon className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-foreground mb-2 text-left text-lg font-semibold">
                {params.dialogTitle}
              </DialogTitle>
              <DialogDescription
                id="confirmation-description"
                className="text-muted-foreground text-left text-sm leading-relaxed"
              >
                {params.confirmationMessage}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 pt-6 sm:flex-row">
          {params.showCancelButton !== false && (
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
              }}
              className="w-full sm:w-auto"
              type="button"
            >
              {params.cancelButtonText || t('cancel')}
            </Button>
          )}
          <Button
            id={params.buttonid}
            variant={statusConfig.buttonVariant as any}
            onClick={handleExecute}
            className="w-full sm:w-auto"
            disabled={params.disabled || isPending}
            type="button"
            aria-describedby="confirmation-description"
          >
            {isPending ? (
              <div className="flex items-center gap-2">
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                <span className="sr-only">{t('loading')}</span>
                {t('loading')}
              </div>
            ) : (
              params.confirmationButtonText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationModal;
