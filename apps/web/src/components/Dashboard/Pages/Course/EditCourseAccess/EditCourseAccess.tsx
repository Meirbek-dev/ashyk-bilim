'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@components/ui/table'
import { CourseEditorNotice } from '@/features/courses/editor/components/CourseEditorNotice'
import {
  CourseEditorSection,
  CourseEditorStagedSection,
} from '@/features/courses/editor/components/CourseEditorSection'
import LinkToUserGroup from '@components/Objects/Modals/Dash/EditCourseAccess/LinkToUserGroup'
import { AlertTriangle, Globe, Loader2, SquareUserRound, Users, X } from 'lucide-react'
import { CourseChoiceCard } from '@components/Dashboard/Courses/courseWorkflowUi'
import { unLinkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { useCourseSectionDraft } from '@/features/courses/editor/hooks/useCourseSectionDraft'
import { useCourse } from '@components/Contexts/CourseContext'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RadioGroup } from '@/components/ui/radio-group'
import { useSaveSection } from '@/hooks/useSaveSection'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

const EditCourseAccess = () => {
  const course = useCourse()
  const { courseStructure, editorData } = course
  const t = useTranslations('DashPage.Courses.Access')
  const { updateAccess } = useCoursesMutations(courseStructure?.course_uuid ?? '')
  const usergroups = (editorData.linkedUserGroups.data ?? []) as AppUserGroup[]
  const isUserGroupsLoading = course.isEditorDataLoading && editorData.linkedUserGroups.data === null
  const {
    draft: draftPublic,
    setDraft: setDraftPublic,
    isDirty,
    discard,
    markClean,
  } = useCourseSectionDraft({
    section: 'access',
    serverValue: courseStructure?.public,
  })

  const { isSaving, save } = useSaveSection({
    section: 'access',
  })

  const handleAccessSave = async () => {
    if (draftPublic === undefined || !courseStructure || !isDirty) return

    await save(
      async () =>
        updateAccess(
          { public: draftPublic },
          {
            lastKnownUpdateDate: courseStructure.update_date,
          },
        ),
      {
        onSuccess: () => markClean(draftPublic),
      },
    )
  }

  if (!courseStructure) return null

  return (
    <div className="flex flex-col gap-6">
      <CourseEditorStagedSection
        title={t('accessToTheCourse')}
        description={t('accessDescription')}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleAccessSave}
        onDiscard={discard}
      >
        <CourseEditorNotice
          icon={Globe}
          title={t('accessPolicyStagedTitle')}
          description={t('accessPolicyStagedDescription')}
        />

        <RadioGroup
          value={draftPublic === true ? 'public' : draftPublic === false ? 'private' : undefined}
          onValueChange={value => setDraftPublic(value === 'public')}
          disabled={isSaving}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <CourseChoiceCard
            id="access-public"
            value="public"
            checked={draftPublic === true}
            title={t('publicLabel')}
            description={t('publicDescription')}
            icon={Globe}
            disabled={isSaving}
            onSelect={value => setDraftPublic(value === 'public')}
          />

          <CourseChoiceCard
            id="access-private"
            value="private"
            checked={draftPublic === false}
            title={t('usersOnlyLabel')}
            description={t('usersOnlyDescription')}
            icon={Users}
            disabled={isSaving}
            onSelect={value => setDraftPublic(value === 'public')}
          />
        </RadioGroup>
      </CourseEditorStagedSection>

      {draftPublic === false ? (
        <UserGroupsSection
          courseUuid={courseStructure.course_uuid}
          usergroups={usergroups}
          isLoading={isUserGroupsLoading}
        />
      ) : null}
    </div>
  )
}

const UserGroupsSection = ({
  courseUuid,
  usergroups,
  isLoading,
}: {
  courseUuid: string
  usergroups: AppUserGroup[]
  isLoading: boolean
}) => {
  const [userGroupModal, setUserGroupModal] = useState(false)
  const t = useTranslations('DashPage.Courses.Access')

  return (
    <CourseEditorSection title={t('title')} description={t('description')} contentClassName="gap-4">
      <CourseEditorNotice
        icon={Users}
        title={t('userGroupLinksImmediateTitle')}
        description={t('userGroupLinksImmediateDescription')}
      />

      <UserGroupsTable courseUuid={courseUuid} usergroups={usergroups} isLoading={isLoading} />

      <div className="flex justify-end">
        <Dialog open={userGroupModal} onOpenChange={setUserGroupModal}>
          <DialogTrigger render={<Button type="button" size="sm" className="min-w-40" />}>
            <SquareUserRound className="size-4" data-icon="inline-start" aria-hidden />
            <span>{t('linkToUserGroupButton')}</span>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('linkModalTitle')}</DialogTitle>
              <DialogDescription>{t('linkModalDescription')}</DialogDescription>
            </DialogHeader>
            <LinkToUserGroup setUserGroupModal={setUserGroupModal} />
          </DialogContent>
        </Dialog>
      </div>
    </CourseEditorSection>
  )
}

const UserGroupsTable = ({
  courseUuid,
  usergroups,
  isLoading,
}: {
  courseUuid: string
  usergroups: AppUserGroup[]
  isLoading: boolean
}) => {
  const t = useTranslations('DashPage.Courses.Access')

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-24 items-center justify-center rounded-lg border">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="text-primary size-4 animate-spin" aria-hidden />
          <span>{t('loadingUserGroups')}</span>
        </div>
      </div>
    )
  }

  if (usergroups.length === 0) {
    return (
      <Empty className="bg-background border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users className="size-4" aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('title')}</EmptyTitle>
          <EmptyDescription>{t('description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ScrollArea className="bg-background max-h-72 rounded-lg border">
      <Table>
        <TableHeader className="uppercase">
          <TableRow>
            <TableHead>{t('tableHeaderName')}</TableHead>
            <TableHead className="w-32 text-right">{t('tableHeaderActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usergroups.map(usergroup => (
            <UnlinkUserGroupRow key={usergroup.id} usergroup={usergroup} courseUuid={courseUuid} />
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

const UnlinkUserGroupRow = ({ usergroup, courseUuid }: { usergroup: AppUserGroup; courseUuid: string }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const course = useCourse()
  const t = useTranslations('DashPage.Courses.Access')

  const removeUserGroupLink = () => {
    if (typeof usergroup.id !== 'number') return
    const userGroupId = usergroup.id
    startTransition(async () => {
      try {
        const res = await unLinkResourcesToUserGroup(userGroupId, [courseUuid], {
          courseUuid,
        })
        if (res.status === 200) {
          toast.success(t('unlinkUserGroupSuccess'))
          await course.refreshEditorData()
          setIsOpen(false)
        } else {
          const detail = (res.data as AppPayload | undefined)?.detail || ''
          toast.error(t('unlinkUserGroupErrorDetailed', { error: detail }))
        }
      } catch {
        toast.error(t('unlinkUserGroupErrorGeneric'))
      }
    })
  }

  return (
    <TableRow>
      <TableCell className="min-w-0">
        <span className="block truncate">{usergroup.name}</span>
      </TableCell>
      <TableCell className="text-right">
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <Button variant="destructive" size="sm" onClick={() => setIsOpen(true)}>
            <X className="size-4" data-icon="inline-start" aria-hidden />
            <span>{t('deleteLinkButton')}</span>
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-muted text-foreground">
                <AlertTriangle className="size-8" aria-hidden />
              </AlertDialogMedia>
              <AlertDialogTitle>{t('unlinkConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('unlinkConfirmMsg')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending} />
              <AlertDialogAction variant="destructive" onClick={removeUserGroupLink} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                    {t('deleting')}
                  </>
                ) : (
                  t('deleteLinkButton')
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

export default EditCourseAccess
