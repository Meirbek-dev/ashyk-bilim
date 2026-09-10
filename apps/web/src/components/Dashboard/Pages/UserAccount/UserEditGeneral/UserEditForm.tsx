'use client'

import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Controller } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import type { FormValues } from './schema'
import { SUPPORTED_FILES } from './avatar-utils'
import { Check, FileWarning, Info, Loader2, UploadCloud } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert'
import { Card, CardContent } from '@components/ui/card'
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field'
import UserAvatar from '@components/Objects/UserAvatar'
import { Textarea } from '@components/ui/textarea'
import { ThemeModeToggle } from '@/components/theme-mode-toggle'
import { ThemeSelector } from '@/lib/theme-system'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'

interface UserEditFormProps {
  form: UseFormReturn<FormValues>
  profilePicture: {
    error: string | undefined
    success: string
    isLoading: boolean
    localAvatar: File | null
    previewUrl: string | null
    handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  }
}

export function UserEditForm({ form, profilePicture }: UserEditFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('DashPage.UserAccountSettings.generalSection')

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 md:px-8">
      <div className="mb-5 flex flex-col gap-8 lg:flex-row">
        {/* Profile Information Section */}
        <div className="min-w-0 flex-1 space-y-6">
          <div className="space-y-4">
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('email')}</FieldLabel>
                  <FieldContent>
                    <Input id={field.name} type="email" readOnly placeholder={t('emailPlaceholder')} {...field} />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="username"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('username')}</FieldLabel>
                  <FieldContent>
                    <Input id={field.name} readOnly placeholder={t('usernamePlaceholder')} {...field} />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Controller
                control={form.control}
                name="display_name"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('displayName')}</FieldLabel>
                    <FieldContent>
                      <Input id={field.name} placeholder={t('firstNamePlaceholder')} {...field} />
                    </FieldContent>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>

            <Controller
              control={form.control}
              name="bio"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    {t('bio')}
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({400 - (field.value?.length || 0)} {t('charactersLeft')})
                    </span>
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id={field.name}
                      placeholder={t('bioPlaceholder')}
                      className="min-h-[120px] resize-none"
                      maxLength={400}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>

          {/* Theme Controls */}
          <div className="space-y-5 border-t pt-6">
            <ThemeSelector />
            <div className="flex flex-wrap items-center justify-start gap-4">
              <div className="space-y-1">
                <Label className="text-base font-medium">{t('themeSelector.modeTitle')}</Label>
                <p className="text-muted-foreground text-xs">{t('themeSelector.modeDescription')}</p>
              </div>
              <ThemeModeToggle className="ml-4" />
            </div>
          </div>
        </div>

        {/* Profile Picture Section */}
        <div className="w-full lg:w-80">
          <Card className="bg-muted/30 h-full">
            <CardContent className="flex flex-col items-center space-y-6 pt-6">
              <Label className="text-base font-semibold">{t('profilePicture')}</Label>

              {profilePicture.error && (
                <Alert variant="destructive">
                  <FileWarning className="h-4 w-4" />
                  <AlertTitle>{t('avatarError', { error: '' })}</AlertTitle>
                  <AlertDescription className="text-xs">{profilePicture.error}</AlertDescription>
                </Alert>
              )}

              {profilePicture.success && (
                <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-200">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription>{t('avatarSuccess')}</AlertDescription>
                </Alert>
              )}

              <div className="relative">
                <UserAvatar
                  size="3xl"
                  variant="outline"
                  {...(profilePicture.previewUrl ? { avatar_url: profilePicture.previewUrl } : {})}
                  className="ring-background shadow-xl ring-4"
                  imageProps={{ loading: 'eager' }}
                />
                {profilePicture.isLoading && (
                  <div className="bg-background/60 absolute inset-0 flex items-center justify-center rounded-full backdrop-blur-sm">
                    <Loader2 className="text-primary h-8 w-8 animate-spin" />
                  </div>
                )}
              </div>

              <div className="w-full space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="fileInput"
                  accept={SUPPORTED_FILES}
                  className="hidden"
                  onChange={profilePicture.handleFileChange}
                  aria-label={t('ariaLabel')}
                  title={t('selectFile')}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={profilePicture.isLoading}
                >
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {t('changeAvatar')}
                </Button>

                <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-xs">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>{t('recommendedSize')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="border-border/80 mt-6 flex flex-row-reverse border-t pt-5">
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="px-8">
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('saveChanges')
          )}
        </Button>
      </div>
    </div>
  )
}
