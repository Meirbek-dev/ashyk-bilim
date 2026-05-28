'use client'

import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface AntiCheatState {
  copyPasteProtection: boolean
  tabSwitchDetection: boolean
  devtoolsDetection: boolean
  rightClickDisable: boolean
  fullscreenEnforcement: boolean
}

function computeSecurityLevel(state: AntiCheatState): 'low' | 'medium' | 'high' {
  const count = [
    state.copyPasteProtection,
    state.tabSwitchDetection,
    state.devtoolsDetection,
    state.rightClickDisable,
    state.fullscreenEnforcement,
  ].filter(Boolean).length

  if (count >= 4) return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

interface SecurityShieldBadgeProps {
  state: AntiCheatState
  className?: string
}

export default function SecurityShieldBadge({ state, className }: SecurityShieldBadgeProps) {
  const t = useTranslations('Features.Assessments.Studio.SecurityShield')
  const level = computeSecurityLevel(state)

  const config = {
    low: {
      Icon: Shield,
      label: t('low'),
      description: t('lowDescription'),
      className: 'text-muted-foreground border-border bg-muted/30',
    },
    medium: {
      Icon: ShieldAlert,
      label: t('medium'),
      description: t('mediumDescription'),
      className:
        'text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:bg-amber-950/30',
    },
    high: {
      Icon: ShieldCheck,
      label: t('high'),
      description: t('highDescription'),
      className: 'text-lime-700 border-lime-400 bg-lime-50 dark:text-lime-300 dark:border-lime-700 dark:bg-lime-950/30',
    },
  } as const

  const { Icon, label, description, className: levelClass } = config[level]

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              'flex cursor-default items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-300',
              levelClass,
              className,
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </div>
        }
      />
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-xs">{description}</p>
      </TooltipContent>
    </Tooltip>
  )
}
