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
import { useApiError } from '@/hooks/useApiError'
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

function UserEditGeneral() {
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
  const { handleApiError, toastApiError } = useApiError<UserEditFormInput>()

  const form = useForm<UserEditFormInput, unknown, FormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      username: '',
      display_name: '',
      email: '',
      bio: '',
    },
    mode: 'onChange',
  })

  useEffect(() => {
    const fetchData = async () => {
      if (me?.id) {
        try {
          const [userDataResponse, localeResponse] = await Promise.all([Promise.resolve(me), getUserLocale()])
          setUserData(userDataResponse)
          setCurrentLocale(localeResponse)

          // Reset form with fetched data
          form.reset({
            username: userDataResponse.username || '',
            display_name: userDataResponse.display_name || '',
            email: userDataResponse.email || '',
            bio: userDataResponse.bio || '',
          })
        } catch (fetchError) {
          setError(handleApiError(fetchError, { fallback: t('profileLoadError') }).message)
        } finally {
          setInitialLoading(false)
        }
      } else {
        setInitialLoading(false)
      }
    }

    fetchData()
  }, [form, handleApiError, me, t])

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl])

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
      const previewUrl = URL.createObjectURL(uploadFile)
      setAvatarPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      await updateUserAvatar(uploadFile)
      setSuccess(t('avatarSuccess'))
      router.refresh()
    } catch (uploadError) {
      setError(handleApiError(uploadError, { fallback: t('avatarError') }).message)
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    if (!userData?.id) {
      toast.error(t('profileUpdateError'))
      return
    }

    const loadingToast = toast.loading(t('updating'))

    try {
      await updateProfile({ display_name: values.display_name, bio: values.bio ?? '' })
      setUserData(current => (current ? { ...current, ...values } : null))

      toast.dismiss(loadingToast)
      router.refresh()
      toast.success(t('profileUpdateSuccess'))
    } catch (updateError) {
      toastApiError(updateError, { setError: form.setError, fallback: t('profileUpdateError'), toastId: loadingToast })
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
