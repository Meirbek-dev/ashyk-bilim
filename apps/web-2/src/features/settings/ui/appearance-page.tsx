import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'
import { themeManifestOptions } from '#/shared/api/themes'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { MODES, readAppearance, saveMode, saveTheme, showMode, showTheme, type Mode } from '#/shared/lib/appearance'
import { toast } from '#/shared/ui/toast'

import { startTheme, vAppearance } from '../model/settings'
import { profileOptions, updateProfileOptions } from '../queries'
import { ThemePicker } from './theme-picker'

const modeLabels = { system: m.ui_mode_system, light: m.ui_mode_light, dark: m.ui_mode_dark } satisfies Record<
  Mode,
  () => string
>

/** The picked theme and mode on the open page while the user chooses; leaving unsaved puts back the saved ones. */
function Preview({
  theme,
  mode,
  saved,
}: {
  theme: string
  mode: Mode
  saved: { current: { theme: string; mode: Mode } }
}) {
  useEffect(() => {
    showTheme(theme)
    showMode(mode)
  }, [theme, mode])
  useEffect(
    () => () => {
      showTheme(saved.current.theme)
      showMode(saved.current.mode)
    },
    [saved],
  )
  return null
}

/** /settings/appearance: theme, mode and language. A pick shows at once; Save keeps it (theme in the profile). */
export function AppearancePage() {
  const { data: profile } = useSuspenseQuery(profileOptions())
  const { data: themes } = useSuspenseQuery(themeManifestOptions())
  const update = useMutation(updateProfileOptions(useQueryClient()))
  const [defaultValues] = useState<v.InferOutput<typeof vAppearance>>(() => {
    const shown = readAppearance()
    const slugs = themes.map(theme => theme.slug)
    return { theme: startTheme(profile.theme, shown.theme, slugs), mode: shown.mode, locale: getLocale() }
  })
  // What the document shows outside this page: the appearance it opened with, then each saved one.
  const saved = useRef({ theme: defaultValues.theme, mode: defaultValues.mode })
  const form = useAppForm(vAppearance, {
    defaultValues,
    leaveGuard: true,
    onSubmit: async ({ theme, mode, locale }) => {
      await update.mutateAsync({ body: { theme, locale } })
      saveTheme(theme)
      saveMode(mode)
      saved.current = { theme, mode }
      // Paraglide stores the new language and reloads the page in it.
      if (locale === getLocale()) toast.add({ title: m.settings_saved() })
      else await setLocale(locale)
    },
  })
  return (
    <SettingsSection
      title={m.settings_appearance_title()}
      description={m.settings_appearance_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.Subscribe selector={state => state.values}>
        {values => <Preview theme={values.theme} mode={values.mode} saved={saved} />}
      </form.Subscribe>
      <form.Field name="theme">
        {field => <ThemePicker themes={themes} value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
      <form.AppField name="mode">
        {field => (
          <field.RadioGroupField
            label={m.settings_field_mode()}
            options={MODES.map(mode => ({ value: mode, label: modeLabels[mode]() }))}
          />
        )}
      </form.AppField>
      <form.AppField name="locale">
        {field => (
          <field.RadioGroupField
            label={m.ui_locale()}
            options={locales.map(locale => ({ value: locale, label: m.ui_locale_name({}, { locale }) }))}
          />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
