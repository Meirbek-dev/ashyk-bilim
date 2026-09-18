'use client'

import { NativeSelect, NativeSelectOption } from '@components/ui/native-select'
import { linkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { getAbsoluteUrl } from '@services/config/config'
import { useCourse } from '@components/Contexts/CourseContext'
import { useUserGroups } from '@/features/users/hooks/useUsers'
import type { Usergroup } from '@/lib/api/generated/zod'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { ExternalLink, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { isApiError } from '@/lib/api/assertSuccess'
import { useApiError } from '@/hooks/useApiError'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface LinkToUserGroupProps {
  setUserGroupModal: (open: boolean) => void
}

function LinkToUserGroup(props: LinkToUserGroupProps) {
  const t = useTranslations('Components.LinkToUserGroup')
  const { handleApiError } = useApiError()
  const course = useCourse()
  const { courseStructure } = course

  // UX-106: linking writes the group — only groups the user may write are offered.
  const { data: allGroups } = useUserGroups({ enabled: Boolean(courseStructure) })
  const usergroups = allGroups?.filter(group => group.can_write)
  const [selectedUserGroup, setSelectedUserGroup] = useState<string | null>(null)

  const effectiveUserGroup = selectedUserGroup ?? usergroups?.[0]?.id ?? null

  const handleLink = async () => {
    if (!effectiveUserGroup) {
      toast.error(t('selectUserGroupFirst'))
      return
    }
    const courseId = courseStructure.id
    if (!courseId) {
      toast.error(t('linkError', { error: t('unknownError') }))
      return
    }

    try {
      await linkResourcesToUserGroup(effectiveUserGroup, [courseId], {
        courseUuid: courseId,
      })
      props.setUserGroupModal(false)
      toast.success(t('linkSuccess'))
      await course.refreshEditorData()
    } catch (error) {
      if (isApiError(error) && error.status === 403) {
        toast.error(t('noRightsOnGroup'))
        return
      }
      toast.error(t('linkError', { error: handleApiError(error, { fallback: t('unknownError') }).message }))
    }
  }

  const hasGroups = (usergroups?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {hasGroups ? (
        <div className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="usergroup-select" className="flex items-center gap-1.5">
              <Users className="text-muted-foreground size-3.5" />
              {t('userGroupNameLabel')}
            </Label>
            <NativeSelect
              id="usergroup-select"
              className="w-full"
              value={effectiveUserGroup ?? ''}
              onChange={e => setSelectedUserGroup(e.target.value)}
            >
              {effectiveUserGroup === null && (
                <NativeSelectOption value="" disabled>
                  {t('selectUserGroup')}
                </NativeSelectOption>
              )}
              {(usergroups ?? []).map((group: Usergroup) => (
                <NativeSelectOption key={group.id} value={group.id}>
                  {group.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button onClick={handleLink} className="shrink-0">
            {t('linkButton')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">{t('noUserGroupsAvailable')}</p>
          <Link
            className="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
            target="_blank"
            href={getAbsoluteUrl('/dash/users/settings/usergroups')}
          >
            {t('createUserGroupLink')}
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

export default LinkToUserGroup
