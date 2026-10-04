import { LocaleSwitch } from '#/shared/components/locale-switch'
import { ModeSwitch } from '#/shared/components/mode-switch'

/** Language and mode for guests (signed-in users find both in the profile menu). Loaded lazily by the top bar. */
export function GuestSwitches() {
  return (
    <>
      <LocaleSwitch />
      <ModeSwitch />
    </>
  )
}
