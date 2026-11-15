import { Button } from '#/shared/ui/button'

import type { PanelTab } from '../route'
import { tabLabels } from '../model/labels'

type PanelTabsProps = { tabs: PanelTab[]; current: PanelTab; onPick: (tab: PanelTab) => void }

/** The panel's modes: a segmented control written to `?ai=` (a panel mode, not a page tab: no child route). */
export function PanelTabs({ tabs, current, onPick }: PanelTabsProps) {
  return (
    // A segmented control: one quiet track, the chosen mode raised on it.
    <div className="flex self-start rounded-lg bg-muted p-0.5">
      {tabs.map(tab => (
        <Button
          key={tab}
          size="sm"
          variant="ghost"
          className={
            tab === current
              ? 'h-8 bg-card shadow-control hover:bg-card'
              : 'h-8 text-muted-foreground hover:bg-transparent hover:text-foreground'
          }
          aria-pressed={tab === current}
          onClick={() => onPick(tab)}
        >
          {tabLabels[tab]()}
        </Button>
      ))}
    </div>
  )
}
