'use client'

import { CalendarClock, Lock, ShieldAlert, SlidersHorizontal, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { NormalizedScore } from '@/features/assessments/domain/score'
import { isAntiCheatEnabled } from '@/features/assessments/domain/policy'
import type { PolicyView } from '@/features/assessments/domain/policy'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import ScoreSummary from './ScoreSummary'

interface PolicyInspectorProps {
  policy: PolicyView
  score?: NormalizedScore
  accessItems?: string[]
  scheduleItems?: string[]
  title?: string
}

interface InspectorSection {
  value: string
  label: string
  icon: typeof CalendarClock
  body: ReactNode
}

export default function PolicyInspector({
  policy,
  score = { percent: null, source: 'none' } as NonNullable<PolicyInspectorProps['score']>,
  accessItems = [] as NonNullable<PolicyInspectorProps['accessItems']>,
  scheduleItems = [] as NonNullable<PolicyInspectorProps['scheduleItems']>,
  title,
}: PolicyInspectorProps) {
  const t = useTranslations('Components.PolicyInspector')
  const effectiveTitle = title ?? t('title')
  const antiCheatEnabled = isAntiCheatEnabled(policy.antiCheat)
  const possibleSections: (InspectorSection | null)[] = [
    policy.dueAt || scheduleItems.length
      ? {
          value: 'schedule',
          label: t('schedule'),
          icon: CalendarClock,
          body: (
            <div className="space-y-2 text-sm">
              <PolicyRow
                label={t('due')}
                value={policy.dueAt ? new Date(policy.dueAt).toLocaleString() : t('notSet')}
              />
              {scheduleItems.map(item => (
                <div key={item} className="text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          ),
        }
      : null,
    policy.maxAttempts || policy.latePolicy.penaltyPercent
      ? {
          value: 'attempts',
          label: t('attempts'),
          icon: SlidersHorizontal,
          body: (
            <div className="space-y-2 text-sm">
              <PolicyRow
                label={t('maximumAttempts')}
                value={policy.maxAttempts ? String(policy.maxAttempts) : t('unlimited')}
              />
              <PolicyRow label={t('latePenalty')} value={`${policy.latePolicy.penaltyPercent}%`} />
            </div>
          ),
        }
      : null,
    antiCheatEnabled
      ? {
          value: 'anti-cheat',
          label: t('antiCheat'),
          icon: ShieldAlert,
          body: <AntiCheatSummary policy={policy} />,
        }
      : null,
    score.percent !== null
      ? {
          value: 'scoring',
          label: t('scoring'),
          icon: Trophy,
          body: <ScoreSummary score={score} />,
        }
      : null,
    accessItems.length
      ? {
          value: 'access',
          label: t('access'),
          icon: Lock,
          body: (
            <div className="space-y-2">
              {accessItems.map(item => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
          ),
        }
      : null,
  ]
  const sections = possibleSections.filter(isInspectorSection)

  return (
    <div className="space-y-4 p-4 xl:sticky xl:top-[88px] xl:h-[calc(100vh-88px)] xl:overflow-y-auto">
      <div>
        <h2 className="text-sm font-semibold">{effectiveTitle}</h2>
        <p className="text-muted-foreground text-xs">{t('description')}</p>
      </div>
      {sections.length ? (
        <Accordion defaultValue={sections.map(section => section.value)} className="w-full">
          {sections.map(section => {
            const Icon = section.icon
            return (
              <AccordionItem key={section.value} value={section.value}>
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Icon className="size-4" />
                    {section.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent>{section.body}</AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">{t('noPolicySections')}</div>
      )}
    </div>
  )
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function isInspectorSection(section: InspectorSection | null): section is InspectorSection {
  return section !== null
}

function AntiCheatSummary({ policy }: { policy: PolicyView }) {
  const t = useTranslations('Components.PolicyInspector')
  const items = [
    policy.antiCheat.copyPasteProtection ? t('antiCheatItems.copyPasteBlocked') : null,
    policy.antiCheat.tabSwitchDetection ? t('antiCheatItems.tabSwitchesTracked') : null,
    policy.antiCheat.devtoolsDetection ? t('antiCheatItems.devToolsTracked') : null,
    policy.antiCheat.rightClickDisabled ? t('antiCheatItems.rightClickBlocked') : null,
    policy.antiCheat.fullscreenEnforced ? t('antiCheatItems.fullscreenRequired') : null,
  ].filter(Boolean)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
      <PolicyRow
        label={t('autoSubmitThreshold')}
        value={policy.antiCheat.violationThreshold?.toString() ?? t('notSet')}
      />
    </div>
  )
}
