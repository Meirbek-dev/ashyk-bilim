'use client';
import { Tooltip, TooltipContent as TooltipContentPrimitive, TooltipTrigger } from '@/components/ui/tooltip';
import React, { Children, cloneElement, isValidElement } from 'react';
import styles from './Tooltip.module.css';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  sideOffset?: number;
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left'; // default is bottom
  slateBlack?: boolean;
  unstyled?: boolean; // new prop to remove default styling
}

const ToolTip = ({ sideOffset, content, children, side = 'bottom', slateBlack, unstyled }: TooltipProps) => {
  // If caller passed a single React element, use it as the `render` prop so it becomes the trigger element
  const singleChild = Children.count(children) === 1 ? (Children.only(children) as React.ReactElement) : null;

  const triggerRender = isValidElement(singleChild) ? cloneElement(singleChild) : <span />;

  return (
    <Tooltip>
      {isValidElement(singleChild) ? (
        // Pass the element itself as render (no children so it won't be duplicated)
        <TooltipTrigger render={triggerRender} />
      ) : (
        // Fallback: keep children as-is and render them as the trigger
        <TooltipTrigger>{children}</TooltipTrigger>
      )}

      <TooltipContentPrimitive
        side={side}
        sideOffset={sideOffset}
        className={cn(styles.tooltipContent, slateBlack && styles.slateBlack, unstyled && styles.unstyled)}
      >
        {content}
      </TooltipContentPrimitive>
    </Tooltip>
  );
};

export default ToolTip;
