'use client';

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
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@components/ui/table';
import LinkToUserGroup from '@components/Objects/Modals/Dash/EditCourseAccess/LinkToUserGroup';
import { AlertTriangle, Globe, Loader2, SquareUserRound, Users, X } from 'lucide-react';
import { CourseChoiceCard } from '@components/Dashboard/Courses/courseWorkflowUi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { unLinkResourcesToUserGroup } from '@services/usergroups/usergroups';
import { SectionHeader } from '@components/Dashboard/Courses/SectionHeader';
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useSyncDirtySection } from '@/hooks/useSyncDirtySection';
import { useCourse } from '@components/Contexts/CourseContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup } from '@/components/ui/radio-group';
import { useSaveSection } from '@/hooks/useSaveSection';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const EditCourseAccess = () => {
  const course = useCourse();
  const { courseStructure, editorData } = course;
  const t = useTranslations('DashPage.Courses.Access');
  const { updateAccess } = useCoursesMutations(courseStructure?.course_uuid ?? '');
  const [draftPublic, setDraftPublic] = useState<boolean | undefined>(() => courseStructure?.public);
  const usergroups = editorData.linkedUserGroups.data ?? [];
  const isUserGroupsLoading = course.isEditorDataLoading && editorData.linkedUserGroups.data === null;

  const isDirtyRef = useRef(false);
  isDirtyRef.current = draftPublic !== undefined && draftPublic !== courseStructure?.public;
  const isDirty = isDirtyRef.current;

  useSyncDirtySection('access', isDirty);

  const handleDiscard = () => setDraftPublic(courseStructure?.public);

  const { isSaving, save } = useSaveSection({
    section: 'access',
  });

  // Rehydrate from server when not dirty (e.g. initial load, external update)
  useEffect(() => {
    if (!isDirtyRef.current) {
      setDraftPublic(courseStructure?.public);
    }
  }, [courseStructure?.public]);

  const handleAccessSave = async () => {
    if (!(draftPublic !== undefined) || !isDirty) return;
    await save(async () =>
      updateAccess(
        { public: draftPublic },
        {
          lastKnownUpdateDate: courseStructure.update_date,
        },
      ),
    );
  };

  if (!courseStructure) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('accessToTheCourse')}
        description={t('accessDescription')}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleAccessSave}
        onDiscard={handleDiscard}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('accessToTheCourse')}</CardTitle>
          <Alert className="border-border bg-muted/40">
            <Globe className="size-4" />
            <AlertTitle>{t('accessPolicyStagedTitle')}</AlertTitle>
            <AlertDescription>{t('accessPolicyStagedDescription')}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={draftPublic === true ? 'public' : draftPublic === false ? 'private' : undefined}
            onValueChange={(val) => setDraftPublic(val === 'public')}
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
              onSelect={(value) => setDraftPublic(value === 'public')}
            />

            <CourseChoiceCard
              id="access-private"
              value="private"
              checked={draftPublic === false}
              title={t('usersOnlyLabel')}
              description={t('usersOnlyDescription')}
              icon={Users}
              disabled={isSaving}
              onSelect={(value) => setDraftPublic(value === 'public')}
            />
          </RadioGroup>
        </CardContent>
      </Card>

      {/* User groups — only shown for private courses */}
      {draftPublic === false && (
        <UserGroupsSection
          usergroups={usergroups}
          isLoading={isUserGroupsLoading}
        />
      )}
    </div>
  );
};

const UserGroupsSection = ({ usergroups, isLoading }: { usergroups: any[]; isLoading: boolean }) => {
  const course = useCourse();
  const [userGroupModal, setUserGroupModal] = useState(false);
  const t = useTranslations('DashPage.Courses.Access');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <Alert className="border-border bg-muted/40">
          <Users className="size-4" />
          <AlertTitle>{t('userGroupLinksImmediateTitle')}</AlertTitle>
          <AlertDescription>{t('userGroupLinksImmediateDescription')}</AlertDescription>
        </Alert>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t('description')}</p>

        <ScrollArea className="bg-background max-h-72 rounded-lg border">
          <Table>
            <TableHeader className="uppercase">
              <TableRow>
                <TableHead>{t('tableHeaderName')}</TableHead>
                <TableHead>{t('tableHeaderActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={2}>{t('loadingUserGroups')}</TableCell>
                </TableRow>
              ) : null}
              {usergroups?.map((usergroup: any) => (
                <UnlinkUserGroupRow
                  key={usergroup.id}
                  usergroup={usergroup}
                  courseUuid={course.courseStructure.course_uuid}
                />
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex justify-end">
          <Dialog
            open={userGroupModal}
            onOpenChange={setUserGroupModal}
          >
            <DialogTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  className="min-w-40"
                />
              }
            >
              <SquareUserRound className="h-3 w-3 sm:h-4 sm:w-4" />
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
      </CardContent>
    </Card>
  );
};

// Separate component for unlink row with its own dialog state
const UnlinkUserGroupRow = ({ usergroup, courseUuid }: { usergroup: any; courseUuid: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const course = useCourse();
  const t = useTranslations('DashPage.Courses.Access');

  const removeUserGroupLink = () => {
    startTransition(async () => {
      try {
        const res = await unLinkResourcesToUserGroup(usergroup.id, courseUuid, {
          courseUuid,
        });
        if (res.status === 200) {
          toast.success(t('unlinkUserGroupSuccess'));
          await course.refreshEditorData();
          setIsOpen(false);
        } else {
          toast.error(t('unlinkUserGroupErrorDetailed', { error: res.data.detail }));
        }
      } catch {
        toast.error(t('unlinkUserGroupErrorGeneric'));
      }
    });
  };

  return (
    <TableRow>
      <TableCell>{usergroup.name}</TableCell>
      <TableCell>
        <AlertDialog
          open={isOpen}
          onOpenChange={setIsOpen}
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsOpen(true)}
          >
            <X className="h-4 w-4" />
            <span>{t('deleteLinkButton')}</span>
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-muted text-foreground">
                <AlertTriangle className="size-8" />
              </AlertDialogMedia>
              <AlertDialogTitle>{t('unlinkConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('unlinkConfirmMsg')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction
                variant="destructive"
                onClick={removeUserGroupLink}
                disabled={isPending}
              >
                {isPending ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {t('deleting')}
                  </div>
                ) : (
                  t('deleteLinkButton')
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
};

export default EditCourseAccess;
