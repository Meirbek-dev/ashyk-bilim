import { Button } from '#/shared/ui/button'

import type { PanelTab } from '../model/ai'
import { tabLabels } from '../model/labels'

type PanelTabsProps = { tabs: PanelTab[]; current: PanelTab; onPick: (tab: PanelTab) => void }

/** The panel's modes: a segmented control written to `?ai=` (a panel mode, not a page tab: no child route). */
export function PanelTabs({ tabs, current, onPick }: PanelTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b pb-2">
      {tabs.map(tab => (
        <Button
          key={tab}
          size="sm"
          variant={tab === current ? 'secondary' : 'ghost'}
          aria-pressed={tab === current}
          onClick={() => onPick(tab)}
        >
          {tabLabels[tab]()}
        </Button>
      ))}
    </div>
  )
}
