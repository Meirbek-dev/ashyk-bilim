import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { SIZES, readAppearance, saveSize, type Size } from '#/shared/lib/appearance'

import type { MenuChoice } from './choice-items'

export const sizeLabels: Record<Size, () => string> = {
  normal: m.ui_size_normal,
  large: m.ui_size_large,
  larger: m.ui_size_larger,
}

/** Normal / large / extra large text, saved in a cookie and applied without a reload (the profile menu, settings). */
export function useSizeChoice(): MenuChoice {
  const [size, setSize] = useState(() => readAppearance().size)
  return {
    label: m.ui_size(),
    value: size,
    options: SIZES.map(value => ({ value, label: sizeLabels[value]() })),
    onValueChange: value => {
      const next = SIZES.find(entry => entry === value)
      if (!next) return
      saveSize(next)
      setSize(next)
    },
  }
}
