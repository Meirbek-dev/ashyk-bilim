import { cn } from 'cn'

import { buttonVariants as kitButtonVariants } from '#/shared/ui/button'

/**
 * The kit's button classes, merged: a link that looks like a button gets them raw (no `<Button>` to run `cn`), and
 * unmerged the base `border-transparent` beats a variant's `border-border`: outline links lost their border.
 */
export const buttonVariants = (...args: Parameters<typeof kitButtonVariants>) => cn(kitButtonVariants(...args))
