import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { UpdateProfileRequest, UserProfile } from '#/shared/api/gen/types.gen'
import { vUpdateProfileRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { Link } from '#/shared/components/link'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { updateProfileOptions } from '../queries'

/** Name, organization and bio; login and email are shown, not edited. */
export function ProfileDetails({ profile }: { profile: UserProfile }) {
  const update = useMutation(updateProfileOptions(useQueryClient()))
  // Captured once: a refetch must not reset what the user typed.
  const [defaultValues] = useState<UpdateProfileRequest>(() => ({
    display_name: profile.display_name,
    organization: profile.organization,
    bio: profile.bio,
  }))
  const form = useAppForm(vUpdateProfileRequest, {
    defaultValues,
    onSubmit: body => update.mutateAsync({ body }, { onSuccess: () => toast.add({ title: m.settings_saved() }) }),
  })
  return (
    <SettingsSection
      title={m.settings_details_title()}
      description={m.settings_details_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm @md:grid-cols-2">
        <dt className="text-muted-foreground">{m.settings_field_username()}</dt>
        <dd className="wrap-anywhere">{profile.username}</dd>
        <dt className="text-muted-foreground">{m.settings_field_email()}</dt>
        <dd className="wrap-anywhere">{profile.email}</dd>
      </dl>
      <p className="text-sm">
        <Link to="/users/$username" params={{ username: profile.username }}>
          {m.settings_public_link()}
        </Link>
      </p>
      <form.AppField name="display_name">
        {field => <field.TextField label={m.settings_field_display_name()} autoComplete="name" required />}
      </form.AppField>
      <form.AppField name="organization">
        {field => (
          <field.TextField
            label={m.settings_field_organization()}
            description={m.settings_field_organization_hint()}
            autoComplete="organization"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="bio">{field => <field.TextareaField label={m.settings_field_bio()} />}</form.AppField>
    </SettingsSection>
  )
}
