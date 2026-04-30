'use client';

import { CalendarClock, Lock, ShieldAlert, SlidersHorizontal, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';

import type { NormalizedScore } from '@/features/assessments/domain/score';
import { isAntiCheatEnabled } from '@/features/assessments/domain/policy';
import type { PolicyView } from '@/features/assessments/domain/policy';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import ScoreSummary from './ScoreSummary';

interface PolicyInspectorProps {
  policy: PolicyView;
  score?: NormalizedScore;
  accessItems?: string[];
  scheduleItems?: string[];
  title?: string;
}

interface InspectorSection {
  value: string;
  label: string;
  icon: typeof CalendarClock;
  body: ReactNode;
}

export default function PolicyInspector({
  policy,
  score = { percent: null, source: 'none' },
  accessItems = [],
  scheduleItems = [],
  title = 'Policy',
}: PolicyInspectorProps) {
  const antiCheatEnabled = isAntiCheatEnabled(policy.antiCheat);
  const possibleSections: (InspectorSection | null)[] = [
    policy.dueAt || scheduleItems.length
      ? {
          value: 'schedule',
          label: 'Schedule',
          icon: CalendarClock,
          body: (
            <div className="space-y-2 text-sm">
              <PolicyRow
                label="Due"
                value={policy.dueAt ? new Date(policy.dueAt).toLocaleString() : 'Not set'}
              />
              {scheduleItems.map((item) => (
                <div
                  key={item}
                  className="text-muted-foreground"
                >
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
          label: 'Attempts',
          icon: SlidersHorizontal,
          body: (
            <div className="space-y-2 text-sm">
              <PolicyRow
                label="Maximum attempts"
                value={policy.maxAttempts ? String(policy.maxAttempts) : 'Unlimited'}
              />
              <PolicyRow
                label="Late penalty"
                value={`${policy.latePolicy.penaltyPercent}%`}
              />
            </div>
          ),
        }
      : null,
    antiCheatEnabled
      ? {
          value: 'anti-cheat',
          label: 'Anti-cheat',
          icon: ShieldAlert,
          body: <AntiCheatSummary policy={policy} />,
        }
      : null,
    score.percent !== null
      ? {
          value: 'scoring',
          label: 'Scoring',
          icon: Trophy,
          body: <ScoreSummary score={score} />,
        }
      : null,
    accessItems.length
      ? {
          value: 'access',
          label: 'Access',
          icon: Lock,
          body: (
            <div className="space-y-2">
              {accessItems.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                >
                  {item}
                </Badge>
              ))}
            </div>
          ),
        }
      : null,
  ];
  const sections = possibleSections.filter(isInspectorSection);

  return (
    <div className="space-y-4 p-4 xl:sticky xl:top-[88px] xl:h-[calc(100vh-88px)] xl:overflow-y-auto">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">Schedule, attempts, anti-cheat, scoring, and access.</p>
      </div>
      {sections.length ? (
        <Accordion
          defaultValue={sections.map((section) => section.value)}
          className="w-full"
        >
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <AccordionItem
                key={section.value}
                value={section.value}
              >
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Icon className="size-4" />
                    {section.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent>{section.body}</AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          No policy sections are enabled for this activity.
        </div>
      )}
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function isInspectorSection(section: InspectorSection | null): section is InspectorSection {
  return section !== null;
}

function AntiCheatSummary({ policy }: { policy: PolicyView }) {
  const items = [
    policy.antiCheat.copyPasteProtection ? 'Copy/paste blocked' : null,
    policy.antiCheat.tabSwitchDetection ? 'Tab switches tracked' : null,
    policy.antiCheat.devtoolsDetection ? 'DevTools tracked' : null,
    policy.antiCheat.rightClickDisabled ? 'Right-click blocked' : null,
    policy.antiCheat.fullscreenEnforced ? 'Fullscreen required' : null,
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge
            key={item}
            variant="outline"
          >
            {item}
          </Badge>
        ))}
      </div>
      <PolicyRow
        label="Auto-submit threshold"
        value={policy.antiCheat.violationThreshold?.toString() ?? 'Not set'}
      />
    </div>
  );
}
