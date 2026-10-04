import { useNavigate } from '@tanstack/react-router'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { vAiRunKind, vAiRunStatus } from '#/shared/api/gen/valibot.gen'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { RUN_DAYS, type AdminAiSearch } from '../route'
import { kindLabels, runStatusLabels } from '../model/labels'

const vDays = v.pipe(v.string(), v.transform(Number), v.picklist(RUN_DAYS))

/** Period, status and kind of the runs list: each is a search param (B-AI-21). */
export function RunsFilters({ search }: { search: AdminAiSearch }) {
  const navigate = useNavigate({ from: '/admin/ai' })
  const set = (patch: Partial<AdminAiSearch>) =>
    void navigate({ search: prev => ({ ...prev, ...patch, run: undefined }) })
  return (
    <div className="flex flex-wrap gap-2">
      <NativeSelect
        aria-label={m.ai_filter_days()}
        value={String(search.days)}
        onChange={event => {
          const days = v.safeParse(vDays, event.target.value)
          if (days.success) set({ days: days.output })
        }}
      >
        {RUN_DAYS.map(days => (
          <NativeSelectOption key={days} value={String(days)}>
            {m.ai_days({ count: days })}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={m.ai_filter_status()}
        value={search.status ?? ''}
        onChange={event => set({ status: v.parse(v.optional(vAiRunStatus), event.target.value || undefined) })}
      >
        <NativeSelectOption value="">{m.ai_all()}</NativeSelectOption>
        {vAiRunStatus.options.map(status => (
          <NativeSelectOption key={status} value={status}>
            {runStatusLabels[status]()}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={m.ai_filter_kind()}
        value={search.kind ?? ''}
        onChange={event => set({ kind: v.parse(v.optional(vAiRunKind), event.target.value || undefined) })}
      >
        <NativeSelectOption value="">{m.ai_all()}</NativeSelectOption>
        {vAiRunKind.options.map(kind => (
          <NativeSelectOption key={kind} value={kind}>
            {kindLabels[kind]()}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
