import {
  createChange,
  createReorder,
  createTransfer,
  definePrimitive,
  type ChangeDetails,
  type ReorderDraft,
  type ReorderMessage,
  type ReorderReason,
  type TransferDraft,
  type TransferMessage,
  type TransferReason,
} from '@ui-sdk/core'
import { createParts, type PartProps } from '@ui-sdk/react/primitive'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

/**
 * Lists people rearrange by a handle: the pointer drags the row, the keyboard works on the handle (Space picks it up,
 * arrows move it, Space drops it, Escape puts it back). The order shown while a row moves is a draft; only the drop
 * reaches `onValueChange`, and the draft stays on screen until the value catches up, so the app writes the new order
 * into its cache there. Screen readers hear each step in the interface language (ui-sdk's own words are English).
 */

const flag = (on: boolean) => (on ? '' : undefined)

type Step = ReorderMessage | TransferMessage

function dragMessage(step: Step) {
  const place =
    'list' in step
      ? m.ui_drag_place_in({ list: step.list, position: step.position, total: step.total })
      : m.ui_drag_place({ position: step.position, total: step.total })
  const said = { name: step.label, place }
  if (step.type === 'grab') return m.ui_drag_picked(said)
  if (step.type === 'move') return m.ui_drag_moved(said)
  if (step.type === 'drop') return m.ui_drag_dropped(said)
  return m.ui_drag_canceled(said)
}

// The handle: a button that says it is picked up (`aria-pressed`) and how to work it (the instructions part).
const handleAttrs = (moving: boolean, id: string) => ({
  type: 'button',
  'aria-pressed': String(moving),
  'aria-roledescription': m.ui_drag_role(),
  'aria-describedby': `${id}-help`,
})

type SortableOptions = {
  value?: string[]
  /** The new order after a drop, with the key of the row that moved. */
  onValueChange?: (value: string[], details: ChangeDetails<ReorderReason> & { key: string }) => void
  /** What a screen reader calls a row, when its text says more than its name. */
  label?: (key: string) => string | undefined
}

const sortablePrimitive = definePrimitive({
  name: 'sortable',
  options: { value: 'list', onValueChange: 'callback', label: 'value' },
  controlled: ['value'],
  state: (options: SortableOptions) => ({ value: options.value ?? [], moving: null as ReorderDraft | null }),
  sync: options => (options.value === undefined ? {} : { value: options.value }),
  api: context => {
    const change = createChange(context)
    const reorder = createReorder(context, {
      slot: 'item',
      key: 'value',
      draft: 'moving',
      // A drop commits the draft: its key is the row that moved.
      set: (value, details) => change('value', value, { ...details, key: context.store.get().moving?.key ?? '' }),
      label: key => context.options().label?.(key),
      message: dragMessage,
      // A copy follows the pointer above the page, so a list that scrolls neither clips it nor stops it: its edges scroll.
      preview: true,
    })
    return { reorder }
  },
  slots: slot => ({
    root: slot({ state: (state, { api }) => ({ order: api.reorder.order(state) }) }),
    item: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: (state, { api, key }) => ({
        'data-moving': flag(api.reorder.moving(state, key)),
        'data-dragging': flag(api.reorder.dragging(state, key)),
      }),
      bind: (el, part) => part.api.reorder.bind(el, part),
    }),
    handle: slot<{ value?: string }>({
      props: { value: { kind: 'string', from: 'item' } },
      attrs: (state, { api, key, id }) => handleAttrs(api.reorder.moving(state, key), id),
      on: {
        keydown: (event, { api, key }) => void api.reorder.keydown(event, key),
        pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
      },
    }),
    help: slot({ attrs: (_, { id }) => ({ id: `${id}-help`, hidden: '' }) }),
  }),
})

type Lists = Record<string, string[]>

type TransferListsOptions = {
  value?: Lists
  /** Every list after a drop, with what moved: `key` from list `from` to `index` in list `to`. */
  onValueChange?: (
    value: Lists,
    details: ChangeDetails<TransferReason> & { key: string; from: string; to: string; index: number },
  ) => void
  label?: (key: string) => string | undefined
  /** What a screen reader calls a list. */
  listLabel?: (list: string) => string | undefined
}

const transferPrimitive = definePrimitive({
  name: 'transfer-lists',
  options: { value: 'value', onValueChange: 'callback', label: 'value', listLabel: 'value' },
  controlled: ['value'],
  state: (options: TransferListsOptions) => ({ value: options.value ?? {}, moving: null as TransferDraft | null }),
  sync: options => (options.value === undefined ? {} : { value: options.value }),
  api: context => {
    const change = createChange(context)
    const transfer = createTransfer(context, {
      key: 'value',
      draft: 'moving',
      set: (value, details) => change('value', value, details),
      label: key => context.options().label?.(key),
      listLabel: list => context.options().listLabel?.(list),
      message: dragMessage,
    })
    // The lists stand one under another: Up past a list's first row goes to the end of the list above, Down past its
    // last row to the start of the one below (Left and Right still jump a list, as ui-sdk does).
    const keydown = (event: KeyboardEvent, key: string) => {
      const draft = context.store.get().moving
      const down = event.key === 'ArrowDown'
      if (
        !draft ||
        draft.pointer ||
        (!down && event.key !== 'ArrowUp') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return transfer.keydown(event, key)
      const names = Object.keys(draft.lists)
      const at = names.findIndex(name => draft.lists[name]?.includes(key))
      const rows = draft.lists[names[at] ?? ''] ?? []
      const edge = down ? rows.indexOf(key) === rows.length - 1 : rows.indexOf(key) === 0
      if (!edge) return transfer.keydown(event, key)
      event.preventDefault()
      for (let next = at + (down ? 1 : -1); next >= 0 && next < names.length; next += down ? 1 : -1) {
        const name = names[next] ?? ''
        if (transfer.moveTo(name, down ? 0 : (draft.lists[name]?.length ?? 0))) break
      }
      return true
    }
    return { transfer, keydown }
  },
  slots: slot => ({
    root: slot({ state: (state, { api }) => ({ lists: api.transfer.lists(state) }) }),
    list: slot<{ value: string }>({
      props: { value: 'string' },
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    item: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: (state, { api, key }) => ({
        'data-moving': flag(api.transfer.moving(state, key)),
        'data-dragging': flag(api.transfer.dragging(state, key)),
      }),
      bind: (el, { api, key }) => api.transfer.bindItem(el, key),
    }),
    handle: slot<{ value?: string }>({
      props: { value: { kind: 'string', from: 'item' } },
      attrs: (state, { api, key, id }) => handleAttrs(api.transfer.moving(state, key), id),
      on: {
        keydown: (event, { api, key }) => void api.keydown(event, key),
        pointerdown: (event, { api, key }) => api.transfer.pointerdown(event, key),
      },
    }),
    help: slot({ attrs: (_, { id }) => ({ id: `${id}-help`, hidden: '' }) }),
  }),
})

const sortable = createParts(sortablePrimitive, { root: 'div', item: 'li', handle: 'button', help: 'span' })
const transfer = createParts(transferPrimitive, { root: 'div', list: 'ol', item: 'li', handle: 'button', help: 'span' })

type RootProps<Options, Shown> = Options &
  Omit<PartProps<'div'>, keyof Options | 'children' | 'defaultValue'> & { children: (shown: Shown) => ReactNode }

/**
 * A list sorted by handles. `children` renders the order shown (the draft while a row moves) as `SortableItem`s in
 * an `ol`, each with a `SortableHandle`; the instructions the handles point to come along.
 */
function Sortable({ children, ...props }: RootProps<SortableOptions, string[]>) {
  return (
    <sortable.Root {...props}>
      {({ order }) => (
        <>
          {children(order)}
          <sortable.Help>{m.ui_drag_instructions()}</sortable.Help>
        </>
      )}
    </sortable.Root>
  )
}

/** Lists rows move between (`TransferList`s of `TransferItem`s with `TransferHandle`s): `children` gets them all. */
function Transfer({ children, ...props }: RootProps<TransferListsOptions, Lists>) {
  return (
    <transfer.Root {...props}>
      {({ lists }) => (
        <>
          {children(lists)}
          <transfer.Help>{m.ui_drag_instructions()}</transfer.Help>
        </>
      )}
    </transfer.Root>
  )
}

// A handle is the `render` of an icon button, with `touch-none`: a finger on it drags the row, not the page.
const SortableItem = sortable.Item
const SortableHandle = sortable.Handle
const TransferList = transfer.List
const TransferItem = transfer.Item
const TransferHandle = transfer.Handle

export { Sortable, SortableHandle, SortableItem, Transfer, TransferHandle, TransferItem, TransferList }
