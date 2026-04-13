'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import type React from 'react';

interface PermissionTooltipProps {
  children: React.ReactElement;
  enabled: boolean;
  action?: string;
  reason?: string;
  showOnEnabled?: boolean;
}

/**
 * Wrapper component that adds permission-based tooltips to UI elements.
 *
 * Shows helpful messages explaining why an action is disabled when the user
 * lacks permission, or provides context when enabled.
 *
 * @example
 * ```tsx
 * <PermissionTooltip enabled={canDelete} action="delete">
 *   <Button disabled={!canDelete}>Delete</Button>
 * </PermissionTooltip>
 * ```
 */
export function PermissionTooltip({
  children,
  enabled,
  action = 'perform this action',
  reason,
  showOnEnabled = false,
}: PermissionTooltipProps) {
  const t = useTranslations('Components.PermissionTooltip');

  // Don't show tooltip if enabled and showOnEnabled is false
  if (enabled && !showOnEnabled) {
    return children;
  }

  const getTooltipContent = () => {
    if (reason) {
      return reason;
    }

    if (enabled) {
      return t('enabled', { action, default: `You can ${action}` });
    }

    return t('disabled', {
      action,
      default: `You don't have permission to ${action}`,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent>
          <p className="text-sm">{getTooltipContent()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default PermissionTooltip;
