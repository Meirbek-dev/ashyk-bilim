'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { linkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { getAbsoluteUrl } from '@services/config/config'
import { useCourse } from '@components/Contexts/CourseContext'
import { useUserGroups } from '@/features/users/hooks/useUsers'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { ExternalLink, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface UserGroup {
  id: number
  name: string
  description?: string
}

interface LinkToUserGroupProps {
  setUserGroupModal: (open: boolean) => void
}

const LinkToUserGroup = (props: LinkToUserGroupProps) => {
  const t = useTranslations('Components.LinkToUserGroup')
  const course = useCourse()
  const { courseStructure } = course

  const { data: usergroups } = useUserGroups({ enabled: Boolean(courseStructure) })
  const [selectedUserGroup, setSelectedUserGroup] = useState<string | null>(null)

  const effectiveUserGroup = selectedUserGroup ?? (usergroups?.[0]?.id ? String(usergroups[0].id) : null)

  const handleLink = async () => {
    if (!effectiveUserGroup) {
      toast.error(t('selectUserGroupFirst'))
      return
    }

    try {
      const res = await linkResourcesToUserGroup(Number(effectiveUserGroup), courseStructure.course_uuid, {
        courseUuid: courseStructure.course_uuid,
      })
      if (res.status === 200) {
        props.setUserGroupModal(false)
        toast.success(t('linkSuccess'))
        await course.refreshEditorData()
      } else {
        toast.error(t('linkError', { error: res.data?.detail || t('unknownError') }))
      }
    } catch {
      toast.error(t('linkError', { error: t('unknownError') }))
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
            <Select value={effectiveUserGroup ?? undefined} onValueChange={setSelectedUserGroup}>
              <SelectTrigger id="usergroup-select" className="w-full">
                <SelectValue placeholder={t('selectUserGroup')} />
              </SelectTrigger>
              <SelectContent>
                {(usergroups ?? []).map((group: UserGroup) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
