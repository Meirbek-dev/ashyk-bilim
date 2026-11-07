import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'
import { themeManifestOptions } from '#/shared/api/themes'
import { useAppForm } from '#/shared/components/form/use-app-form'
import {
  MODES,
  SIZES,
  readAppearance,
  saveFont,
  saveMode,
  saveSize,
  saveTheme,
  showFont,
  showMode,
  showSize,
  showTheme,
  type Font,
  type Mode,
  type Size,
} from '#/shared/lib/appearance'
import { sizeLabels } from '#/shared/components/size-choice'
import { toast } from '#/shared/ui/toast'

import { startTheme, vAppearance } from '../model/settings'
import { profileOptions, updateProfileOptions } from '../queries'
import { FontPicker } from './font-picker'
import { ThemePicker } from './theme-picker'
import { TypesetSection } from './typeset-section'

const modeLabels = { system: m.ui_mode_system, light: m.ui_mode_light, dark: m.ui_mode_dark } satisfies Record<
  Mode,
  () => string
>

/** A short choice runs along one line, as words on a page; the stock field stacks it. */
const choices =
  'py-2 [&_[data-slot=radio-group]]:flex [&_[data-slot=radio-group]]:flex-wrap [&_[data-slot=radio-group]]:gap-x-8 [&_[data-slot=radio-group]]:gap-y-2 [&_[data-slot=radio-group]>*]:w-auto'

type Shown = { theme: string; mode: Mode; font: Font; size: Size }

/** The picked theme, mode, size and font on the open page while the user chooses; leaving unsaved puts back the saved ones. */
function Preview({ theme, mode, font, size, saved }: Shown & { saved: { current: Shown } }) {
  useEffect(() => {
    showTheme(theme)
    showMode(mode)
    showFont(font)
    showSize(size)
  }, [theme, mode, font, size])
  useEffect(
    () => () => {
      showTheme(saved.current.theme)
      showMode(saved.current.mode)
      showFont(saved.current.font)
      showSize(saved.current.size)
    },
    [saved],
  )
  return null
}

/**
 * /settings/appearance: mode and text size first (the short, common choices), then theme, font and language. A pick
 * shows at once; Save keeps it (theme in the profile).
 */
export function AppearancePage() {
  const { data: profile } = useSuspenseQuery(profileOptions())
  const { data: themes } = useSuspenseQuery(themeManifestOptions())
  const update = useMutation(updateProfileOptions(useQueryClient()))
  const [defaultValues] = useState<v.InferOutput<typeof vAppearance>>(() => {
    const shown = readAppearance()
    const slugs = themes.map(theme => theme.slug)
    return { ...shown, theme: startTheme(profile.theme, shown.theme, slugs), locale: getLocale() }
  })
  // What the document shows outside this page: the appearance it opened with, then each saved one.
  const saved = useRef<Shown>({ ...defaultValues })
  const form = useAppForm(vAppearance, {
    defaultValues,
    leaveGuard: true,
    onSubmit: async ({ theme, mode, font, size, locale }) => {
      await update.mutateAsync({ body: { theme, locale } })
      saveTheme(theme)
      saveMode(mode)
      saveFont(font)
      saveSize(size)
      saved.current = { theme, mode, font, size }
      // Paraglide stores the new language and reloads the page in it.
      if (locale === getLocale()) toast.add({ title: m.settings_saved() })
      else await setLocale(locale)
    },
  })
  return (
    <TypesetSection
      title={m.settings_appearance_title()}
      description={m.settings_appearance_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.Subscribe selector={state => state.values}>
        {values => (
          <Preview theme={values.theme} mode={values.mode} font={values.font} size={values.size} saved={saved} />
        )}
      </form.Subscribe>
      <div className={choices}>
        <form.AppField name="mode">
          {field => (
            <field.RadioGroupField
              label={m.settings_field_mode()}
              options={MODES.map(mode => ({ value: mode, label: modeLabels[mode]() }))}
            />
          )}
        </form.AppField>
      </div>
      <div className={choices}>
        <form.AppField name="size">
          {field => (
            <field.RadioGroupField
              label={m.ui_size()}
              options={SIZES.map(size => ({ value: size, label: sizeLabels[size]() }))}
            />
          )}
        </form.AppField>
      </div>
      <form.Field name="theme">
        {field => <ThemePicker themes={themes} value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
      <form.Field name="font">
        {field => <FontPicker value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
      <div className={choices}>
        <form.AppField name="locale">
          {field => (
            <field.RadioGroupField
              label={m.ui_locale()}
              options={locales.map(locale => ({ value: locale, label: m.ui_locale_name({}, { locale }) }))}
            />
          )}
        </form.AppField>
      </div>
    </TypesetSection>
  )
}
