'use client'

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type * as v from 'valibot'
import { Loader2 } from 'lucide-react'

import { Card } from '@components/ui/card'
import { updateProfile, updateUserAvatar } from '@/lib/users/client'
import { useSession } from '@/hooks/useSession'
import { logout } from '@services/auth/auth'
import { getAbsoluteUrl } from '@services/config/config'
import { getUserLocale } from '@/i18n/locale'
import type { Locale } from '@/i18n/config'

import { createValidationSchema } from './schema'
import type { FormValues } from './schema'
import { UserEditForm } from './UserEditForm'
import {
  SUPPORTED_AVATAR_MIME_TYPES,
  MAX_AVATAR_SOURCE_BYTES,
  MAX_AVATAR_UPLOAD_BYTES,
  optimizeAvatarFile,
} from './avatar-utils'

const UserEditGeneral = () => {
  const router = useRouter()
  const { user: me } = useSession()
  const [localAvatar, setLocalAvatar] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState('')
  const [userData, setUserData] = useState<AppUserSummary | null>(null)
  const [currentLocale, setCurrentLocale] = useState<Locale | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const t = useTranslations('DashPage.Notifications')
  const validationSchema = createValidationSchema(t)

  type UserEditFormInput = v.InferInput<ReturnType<typeof createValidationSchema>>

  const form = useForm<UserEditFormInput, unknown, FormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      username: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      bio: '',
      details: {},
    },
    mode: 'onChange',
  })

  useEffect(() => {
    const fetchData = async () => {
      if (me?.id) {
        try {
          const [userDataResponse, localeResponse] = await Promise.all([Promise.resolve(me), getUserLocale()])
          const details = (userDataResponse.details as FormValues['details'] | undefined) ?? {}
          setUserData(userDataResponse)
          setCurrentLocale(localeResponse)

          // Reset form with fetched data
          form.reset({
            username: userDataResponse.username || '',
            first_name: userDataResponse.first_name || '',
            middle_name: userDataResponse.middle_name || '',
            last_name: userDataResponse.last_name || '',
            email: userDataResponse.email || '',
            bio: userDataResponse.bio || '',
            details,
          })
        } catch (fetchError) {
          const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error'
          console.error('Error fetching initial data:', errorMessage, fetchError)
          setError('Failed to load user data.')
        } finally {
          setInitialLoading(false)
        }
      } else {
        setInitialLoading(false)
      }
    }

    fetchData()
  }, [form, me])

  useEffect(() => {
    if (!localAvatar) {
      setAvatarPreviewUrl(null)
      return
    }

    const previewUrl = URL.createObjectURL(localAvatar)
    setAvatarPreviewUrl(previewUrl)

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [localAvatar])

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(undefined)
    setSuccess('')
    event.currentTarget.value = ''

    if (!me?.id) {
      setError(t('avatarError'))
      setIsLoading(false)
      return
    }
    if (!SUPPORTED_AVATAR_MIME_TYPES.has(file.type) || file.name.toLowerCase().endsWith('.svg')) {
      setError(t('avatarError'))
      setIsLoading(false)
      return
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setError(t('avatarError'))
      setIsLoading(false)
      return
    }

    try {
      const uploadFile = await optimizeAvatarFile(file)
      if (uploadFile.size > MAX_AVATAR_UPLOAD_BYTES) {
        setError(t('avatarError'))
        return
      }

      setLocalAvatar(uploadFile)
      const res = await updateUserAvatar(me.id, uploadFile)
      if (!res.success) {
        setError(res.HTTPmessage || t('avatarError'))
      } else {
        setSuccess(t('avatarSuccess'))
        router.refresh()
      }
    } catch (uploadError) {
      console.error('Avatar upload error:', uploadError)
      setError(t('avatarError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailChange = async (newEmail: string) => {
    toast.success(t('profileUpdateSuccess'), {
      duration: 4000,
    })

    toast(t('promptLogoutOnEmailChange', { newEmail }), {
      duration: 4000,
      icon: '📧',
    })

    // Wait for 4 seconds before signing out
    await new Promise(resolve => setTimeout(resolve, 4000))
    await logout({ redirectTo: getAbsoluteUrl('/') })
  }

  const onSubmit = async (values: FormValues) => {
    if (!userData?.id) {
      toast.error(t('profileUpdateError'))
      return
    }

    const isEmailChanged = values.email !== userData.email
    const loadingToast = toast.loading(t('updating'))

    try {
      await updateProfile(values, userData.id)
      setUserData(current => (current ? { ...current, ...values, middle_name: values.middle_name ?? null } : null))

      toast.dismiss(loadingToast)
      if (isEmailChanged) {
        await handleEmailChange(values.email)
      } else {
        router.refresh()
        toast.success(t('profileUpdateSuccess'))
      }
    } catch (updateError) {
      console.error('Profile update error:', updateError)
      toast.error(t('profileUpdateError'), {
        id: loadingToast,
      })
    }
  }

  if (initialLoading || !userData || !currentLocale) {
    return (
      <Card className="mx-0 sm:mx-10">
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="mx-0 sm:mx-10">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <UserEditForm
          form={form}
          profilePicture={{
            error,
            success,
            isLoading,
            localAvatar,
            previewUrl: avatarPreviewUrl,
            handleFileChange,
          }}
        />
      </form>
    </Card>
  )
}

export default UserEditGeneral
