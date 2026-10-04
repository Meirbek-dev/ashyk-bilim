import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Platform, UpdatePlatformRequest } from '#/shared/api/gen/types.gen'
import { vUpdatePlatformRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/admin'
import { platformVersion, updatePlatformOptions } from '../queries'
import { type BaseVersion, useIfMatch } from './use-if-match'

/**
 * Name, label, texts and the support email (`PATCH /platform`) with `If-Match`; a 412 opens the conflict dialog. The
 * answer replaces the cached platform.
 */
export function PlatformGeneral({ platform, base }: { platform: Platform; base: BaseVersion }) {
  const queryClient = useQueryClient()
  const update = useMutation(updatePlatformOptions(queryClient))
  const write = useIfMatch(
    base,
    (body: UpdatePlatformRequest, version: number) =>
      update.mutateAsync(
        { body, headers: { 'If-Match': version } },
        { onSuccess: () => toast.add({ title: m.admin_saved() }) },
      ),
    () => platformVersion(queryClient),
  )
  // Captured once: the cache write after saving must not reset what the user typed.
  const [defaultValues] = useState<UpdatePlatformRequest>(() => ({
    name: platform.name,
    label: platform.label ?? '',
    description: platform.description,
    about: platform.about,
    email: platform.email,
  }))
  const form = useAppForm(vUpdatePlatformRequest, {
    defaultValues,
    onSubmit: body => write.save(body),
  })
  return (
    <>
      <SettingsSection
        title={m.admin_section_general()}
        description={m.admin_platform_general_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="name">{field => <field.TextField label={m.admin_field_name()} required />}</form.AppField>
        <form.AppField name="label">
          {field => <field.TextField label={m.admin_platform_label()} description={m.admin_platform_label_hint()} />}
        </form.AppField>
        <form.AppField name="description">
          {field => <field.TextField label={m.admin_field_description()} />}
        </form.AppField>
        <form.AppField name="about">{field => <field.TextareaField label={m.admin_platform_about()} />}</form.AppField>
        <form.AppField name="email">
          {field => <field.TextField label={m.admin_platform_email()} type="email" />}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
    </>
  )
}
