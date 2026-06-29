import type { SaveState } from '@/features/assessments/shared/SaveStateBadge'

export interface SaveLedgerEntry {
  id: string
  label: string
  state: SaveState
  updatedAt: number
  retry?: () => void
}

export interface SaveLedgerSummary {
  entries: SaveLedgerEntry[]
  state: SaveState
  hasBlockingSaveState: boolean
  liveMessage: string
}

export function summarizeSaveLedger(entries: SaveLedgerEntry[]): SaveLedgerSummary {
  const activeEntries = entries.filter(entry => entry.state !== 'idle')
  const state = reduceSaveState(activeEntries.map(entry => entry.state))
  return {
    entries: activeEntries,
    state,
    hasBlockingSaveState: state === 'dirty' || state === 'saving' || state === 'error',
    liveMessage: activeEntries.map(entry => `${entry.label}: ${entry.state}`).join(', '),
  }
}

function reduceSaveState(states: SaveState[]): SaveState {
  if (states.includes('error')) return 'error'
  if (states.includes('saving')) return 'saving'
  if (states.includes('dirty')) return 'dirty'
  if (states.includes('saved')) return 'saved'
  return 'idle'
}
