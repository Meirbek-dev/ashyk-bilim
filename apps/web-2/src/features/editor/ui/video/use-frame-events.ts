import { useEffect, useEffectEvent } from 'react'

import { commandFor, type KeyTarget } from '../../model/video-player'
import type { Player } from './use-player'

/** What the focused element does with keys itself; null inside the speed menu, which handles all of them. */
function keyTarget(target: EventTarget | null): KeyTarget | null {
  if (!(target instanceof Element)) return 'player'
  if (target.closest('[role="menu"]')) return null
  if (target instanceof HTMLInputElement && target.type === 'range') return 'slider'
  return target.closest('button') ? 'button' : 'player'
}

/**
 * The frame's keys, pointer and focus, delegated from the frame (any control inside may hold focus). Keys work while
 * focus is anywhere in the player; a click on the picture plays or pauses and puts focus on play/pause, so the keys
 * work after it too. A tap on a phone first brings hidden controls back; a double click goes full screen.
 */
export function useFrameEvents(frame: HTMLElement | null, element: HTMLVideoElement | null, player: Player) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = keyTarget(event.target)
    const command = target === null ? null : commandFor(event, target)
    if (!command) return
    event.preventDefault()
    player.run(command)
    player.active.set(true)
  })
  const onPointer = useEffectEvent((event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    if (event.type === 'pointerleave') player.active.clear()
    else player.active.set(true)
  })
  // Only a keyboard visit keeps the controls up: a mouse click on a button leaves focus there too.
  const onFocus = useEffectEvent((event: FocusEvent) => {
    const next = event.type === 'focusin' ? event.target : event.relatedTarget
    const inside = next instanceof Element && frame?.contains(next) === true
    player.setOnControl(inside && next.matches(':focus-visible'))
  })
  const onPicture = useEffectEvent((event: MouseEvent, touch: boolean) => {
    if (event.type === 'dblclick') return player.fullscreen.toggle()
    if (touch) player.active.set(true)
    if (touch && !player.shown) return
    player.toggle()
    frame?.querySelector<HTMLElement>('[data-play]')?.focus({ preventScroll: true })
  })
  useEffect(() => {
    if (!frame || !element) return undefined
    // The last pointer's kind: a click that came from a tap behaves as a tap.
    let pointerType = 'mouse'
    const down = (event: PointerEvent) => (pointerType = event.pointerType)
    const picture = (event: MouseEvent) => onPicture(event, pointerType === 'touch')
    const pointerTypes = ['pointermove', 'pointerleave'] as const
    frame.addEventListener('keydown', onKey)
    frame.addEventListener('pointerdown', down)
    for (const type of pointerTypes) frame.addEventListener(type, onPointer)
    frame.addEventListener('focusin', onFocus)
    frame.addEventListener('focusout', onFocus)
    element.addEventListener('click', picture)
    element.addEventListener('dblclick', picture)
    return () => {
      frame.removeEventListener('keydown', onKey)
      frame.removeEventListener('pointerdown', down)
      for (const type of pointerTypes) frame.removeEventListener(type, onPointer)
      frame.removeEventListener('focusin', onFocus)
      frame.removeEventListener('focusout', onFocus)
      element.removeEventListener('click', picture)
      element.removeEventListener('dblclick', picture)
    }
  }, [frame, element])
}
