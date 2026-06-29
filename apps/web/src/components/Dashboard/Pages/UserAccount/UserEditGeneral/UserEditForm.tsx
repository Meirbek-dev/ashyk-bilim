'use client'

import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Controller, useWatch } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import type { FormValues } from './schema'
import { DetailCard } from './DetailCard'
import { SUPPORTED_FILES } from './avatar-utils'
import {
  AlertTriangle,
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  FileWarning,
  Globe,
  GraduationCap,
  Info,
  Laptop2,
  Lightbulb,
  Link,
  Loader2,
  MapPin,
  UploadCloud,
  Users,
} from 'lucide-react'
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

export const UserEditForm = ({ form, profilePicture }: UserEditFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tIcons = useTranslations('Components.UserProfilePopup.Icons')
  const tTemplates = useTranslations('DashPage.UserAccountSettings.generalSection.detailTemplateLabels')
  const t = useTranslations('DashPage.UserAccountSettings.generalSection')

  const AVAILABLE_ICONS = [
    { name: 'briefcase', label: tIcons('briefcase'), component: Briefcase },
    {
      name: 'graduation-cap',
      label: tIcons('graduation-cap'),
      component: GraduationCap,
    },
    { name: 'map-pin', label: tIcons('map-pin'), component: MapPin },
    { name: 'building-2', label: tIcons('building-2'), component: Building2 },
    { name: 'speciality', label: tIcons('speciality'), component: Lightbulb },
    { name: 'globe', label: tIcons('globe'), component: Globe },
    { name: 'laptop-2', label: tIcons('laptop-2'), component: Laptop2 },
    { name: 'award', label: tIcons('award'), component: Award },
    { name: 'book-open', label: tIcons('book-open'), component: BookOpen },
    { name: 'link', label: tIcons('link'), component: Link },
    { name: 'users', label: tIcons('users'), component: Users },
    { name: 'calendar', label: tIcons('calendar'), component: Calendar },
  ] as const

  const DETAIL_TEMPLATES = {
    general: [
      { id: 'title', label: tTemplates('title'), icon: 'briefcase', text: '' },
      {
        id: 'affiliation',
        label: tTemplates('affiliation'),
        icon: 'building-2',
        text: '',
      },
      {
        id: 'location',
        label: tTemplates('location'),
        icon: 'map-pin',
        text: '',
      },
      { id: 'website', label: tTemplates('website'), icon: 'globe', text: '' },
      { id: 'linkedin', label: tTemplates('linkedin'), icon: 'link', text: '' },
    ],
    academic: [
      {
        id: 'institution',
        label: tTemplates('institution'),
        icon: 'building-2',
        text: '',
      },
      {
        id: 'department',
        label: tTemplates('department'),
        icon: 'graduation-cap',
        text: '',
      },
      {
        id: 'research',
        label: tTemplates('research'),
        icon: 'book-open',
        text: '',
      },
      {
        id: 'academic-title',
        label: tTemplates('academic-title'),
        icon: 'award',
        text: '',
      },
    ],
    professional: [
      {
        id: 'company',
        label: tTemplates('company'),
        icon: 'building-2',
        text: '',
      },
      {
        id: 'industry',
        label: tTemplates('industry'),
        icon: 'briefcase',
        text: '',
      },
      {
        id: 'expertise',
        label: tTemplates('expertise'),
        icon: 'laptop-2',
        text: '',
      },
      {
        id: 'community',
        label: tTemplates('community'),
        icon: 'users',
        text: '',
      },
    ],
  } as const

  const details = useWatch({
    control: form.control,
    name: 'details',
    defaultValue: {},
  })

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
                    <Input id={field.name} type="email" placeholder={t('emailPlaceholder')} {...field} />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                  <Alert className="mt-2 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription>{t('emailChangeWarning')}</AlertDescription>
                  </Alert>
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
                    <Input id={field.name} placeholder={t('usernamePlaceholder')} {...field} />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Controller
                control={form.control}
                name="first_name"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('firstName')}</FieldLabel>
                    <FieldContent>
                      <Input id={field.name} placeholder={t('firstNamePlaceholder')} {...field} />
                    </FieldContent>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="middle_name"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('middleName')}</FieldLabel>
                    <FieldContent>
                      <Input id={field.name} placeholder={t('middleNamePlaceholder')} {...field} />
                    </FieldContent>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="last_name"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('lastName')}</FieldLabel>
                    <FieldContent>
                      <Input id={field.name} placeholder={t('lastNamePlaceholder')} {...field} />
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

          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{t('additionalDetails')}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      form.setValue('details', {})
                    }}
                  >
                    {t('clearAll')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newDetails = { ...details }
                      const id = `detail-${Date.now()}`
                      newDetails[id] = {
                        id,
                        label: t('newDetail'),
                        icon: '',
                        text: '',
                      }
                      form.setValue('details', newDetails)
                    }}
                  >
                    {t('addDetail')}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(DETAIL_TEMPLATES).map(([key, template]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={() => {
                      const currentIds = new Set(Object.keys(details || {}))
                      const newDetails = { ...details }

                      for (const item of template) {
                        if (!currentIds.has(item.id)) {
                          newDetails[item.id] = { ...item }
                        }
                      }

                      form.setValue('details', newDetails)
                    }}
                  >
                    {key === 'general' && <Briefcase className="h-4 w-4" />}
                    {key === 'academic' && <GraduationCap className="h-4 w-4" />}
                    {key === 'professional' && <Building2 className="h-4 w-4" />}
                    {t(`add${key.charAt(0).toUpperCase() + key.slice(1)}Info`)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(details || {}).map(([id, detail]) => (
                <DetailCard
                  key={id}
                  id={id}
                  detail={detail}
                  onUpdate={(targetId, field, value) => {
                    const newDetails = { ...details }
                    const existingDetail = newDetails[targetId]
                    newDetails[targetId] = {
                      id: existingDetail?.id || targetId,
                      label: existingDetail?.label || '',
                      icon: existingDetail?.icon || '',
                      text: existingDetail?.text || '',
                      ...existingDetail,
                      [field]: value,
                    }
                    form.setValue('details', newDetails)
                  }}
                  onRemove={targetId => {
                    const newDetails = { ...details }
                    delete newDetails[targetId]
                    form.setValue('details', newDetails)
                  }}
                  onLabelChange={(targetId, newLabel) => {
                    const newDetails = { ...details }
                    const existingDetail = newDetails[targetId]
                    newDetails[targetId] = {
                      id: existingDetail?.id || targetId,
                      label: newLabel,
                      icon: existingDetail?.icon || '',
                      text: existingDetail?.text || '',
                      ...existingDetail,
                    }
                    form.setValue('details', newDetails)
                  }}
                  availableIcons={AVAILABLE_ICONS}
                />
              ))}
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
