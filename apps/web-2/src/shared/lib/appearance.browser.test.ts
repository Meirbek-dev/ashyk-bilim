import { expect, test } from 'vite-plus/test'

import { readAppearance, saveTheme } from './appearance'

test("a signed-in user's theme wins over the theme this browser kept (BUG-362/380)", () => {
  saveTheme('bold-tech')
  expect(readAppearance().theme).toBe('bold-tech')
  expect(readAppearance('amethyst-haze').theme).toBe('amethyst-haze')
  // null: the account never chose one - the default, not the previous account's choice.
  expect(readAppearance(null).theme).toBe('modern-minimal')
  // The slug becomes a stylesheet path.
  expect(readAppearance('../../evil').theme).toBe('modern-minimal')
})
