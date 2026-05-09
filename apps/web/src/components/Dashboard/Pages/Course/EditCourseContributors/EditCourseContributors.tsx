'use client';
import {
  CourseChoiceCard,
  courseWorkflowMutedPanelClass,
  getCourseWorkflowToneClass,
} from '@components/Dashboard/Courses/courseWorkflowUi';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionHeader } from '@components/Dashboard/Courses/SectionHeader';
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { Check, ChevronDown, Search, UserPen, Users } from 'lucide-react';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { useSyncDirtySection } from '@/hooks/useSyncDirtySection';
import { useCourse } from '@components/Contexts/CourseContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup } from '@/components/ui/radio-group';
import UserAvatar from '@components/Objects/UserAvatar';
import { useSaveSection } from '@/hooks/useSaveSection';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { useCourseEditorStore } from '@/stores/courses';
import { useSearchContent } from '@/features/search/hooks/useSearch';
import { useLocale, useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/i18n/config';
import { toast } from 'sonner';

type ContributorRole = 'CREATOR' | 'CONTRIBUTOR' | 'MAINTAINER' | 'REPORTER';
type ContributorStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

interface SearchUser {
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  avatar_image: string;
  avatar_url?: string;
  id: number;
  user_uuid: string;
}

interface Contributor {
  id: number;
  user_id: number;
  authorship: ContributorRole;
  authorship_status: ContributorStatus;
  creation_date: string;
  user: {
    username: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    avatar_image: string;
    user_uuid: string;
  };
}

interface BulkAddResponse {
  successful: { username: string; user_id: number }[];
  failed: { username: string; reason: string }[];
}

const formatDate = (dateString: string, locale: Locale) => {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const RoleDropdown = ({
  contributor,
  updateContributor,
  t,
}: {
  contributor: Contributor;
  updateContributor: any;
  t: any;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="outline"
          className="w-[200px] justify-between"
          disabled={contributor.authorship === 'CREATOR' || contributor.authorship_status !== 'ACTIVE'}
        />
      }
    >
      {t(contributor.authorship.toLowerCase()) || contributor.authorship}
      <ChevronDown className="text-muted-foreground ml-2 h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      className="w-[200px]"
    >
      {(['CONTRIBUTOR', 'MAINTAINER', 'REPORTER'] as ContributorRole[]).map((role) => (
        <DropdownMenuItem
          key={role}
          onClick={() => updateContributor(contributor.user_id, { authorship: role })}
          className="justify-between"
        >
          {t(role.toLowerCase())}
          {contributor.authorship === role && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const StatusDropdown = ({
  contributor,
  updateContributor,
  t,
  getStatusStyle,
}: {
  contributor: Contributor;
  updateContributor: any;
  t: any;
  getStatusStyle: (s: ContributorStatus) => string;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="outline"
          className={`w-[200px] justify-between ${getStatusStyle(contributor.authorship_status)}`}
          disabled={contributor.authorship === 'CREATOR'}
        />
      }
    >
      {t(contributor.authorship_status.toLowerCase()) || contributor.authorship_status}
      <ChevronDown className="ml-2 h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      className="w-[200px]"
    >
      {(['ACTIVE', 'INACTIVE', 'PENDING'] as ContributorStatus[]).map((status) => (
        <DropdownMenuItem
          key={status}
          onClick={() => updateContributor(contributor.user_id, { authorship_status: status })}
          className="justify-between"
        >
          {t(status.toLowerCase())}
          {contributor.authorship_status === status && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const sortContributors = (list: Contributor[]) => {
  const creator = list.find((c) => c.authorship === 'CREATOR');
  const others = list.filter((c) => c.authorship !== 'CREATOR');
  return creator ? [creator, ...others] : others;
};

const EditCourseContributors = () => {
  const t = useTranslations('DashPage.EditCourseContributors');
  const locale = useLocale() as Locale;
  const course = useCourse();
  const { courseStructure, editorData } = course;
  const contributors = (editorData.contributors.data ?? []) as Contributor[];
  const isContributorsLoading = course.isEditorDataLoading && editorData.contributors.data === null;
  const setConflict = useCourseEditorStore((state) => state.setConflict);
  const {
    addContributors,
    removeContributors,
    updateAccess,
    updateContributor: updateContributorMutation,
  } = useCoursesMutations(courseStructure?.course_uuid ?? '');

  const [isOpenToContributors, setIsOpenToContributors] = useState<boolean | undefined>(
    () => courseStructure?.open_to_contributors,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResultsOverride, setSearchResultsOverride] = useState<SearchUser[] | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedContributors, setSelectedContributors] = useState<number[]>([]);
  const hasSearchQuery = debouncedSearch.trim().length > 0;
  const { data: contributorSearchResponse, isFetching: isSearching } = useSearchContent(debouncedSearch, {
    limit: 5,
    enabled: hasSearchQuery,
  });
  const fetchedSearchResults: SearchUser[] =
    contributorSearchResponse?.success && contributorSearchResponse.data?.users
      ? contributorSearchResponse.data.users.map((user: SearchUser) =>
          Object.assign(user, {
            avatar_url: user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : ``,
          }),
        )
      : [];
  const searchResults: SearchUser[] = hasSearchQuery ? (searchResultsOverride ?? fetchedSearchResults) : [];

  const isDirtyRef = useRef(false);
  isDirtyRef.current =
    isOpenToContributors !== undefined && isOpenToContributors !== courseStructure?.open_to_contributors;
  const isDirty = isDirtyRef.current;

  const handleDiscard = () => setIsOpenToContributors(courseStructure?.open_to_contributors);

  useSyncDirtySection('contributors', isDirty);

  const { isSaving, save } = useSaveSection({
    section: 'contributors',
  });

  // Rehydrate from server when not dirty
  useEffect(() => {
    if (!isDirtyRef.current) {
      setIsOpenToContributors(courseStructure?.open_to_contributors);
    }
  }, [courseStructure?.open_to_contributors]);

  const masterCheckboxChecked = (() => {
    const nonCreatorContributors = contributors.filter((c) => c.authorship !== 'CREATOR');
    return nonCreatorContributors.length > 0 && selectedContributors.length === nonCreatorContributors.length;
  })();

  const handleUserSelect = (username: string) => {
    setSelectedUsers((prev) => (prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]));
  };

  const raiseContributorConflict = (message: string | undefined, pendingSave: () => Promise<unknown>) => {
    setConflict({
      message: message || t('failedToUpdateContributor'),
      pendingSave,
    });
  };

  const handleAddContributors = async () => {
    if (selectedUsers.length === 0 || isAdding) return;

    const selectedUserObjects = searchResults.filter((user) => selectedUsers.includes(user.username));
    setIsAdding(true);
    try {
      const response = await addContributors(selectedUsers, selectedUserObjects, {
        lastKnownUpdateDate: courseStructure.update_date,
      });
      const result = response.data as BulkAddResponse;

      if (result.successful.length > 0) {
        toast.success(t('successfullyAddedContributors', { count: result.successful.length }));
      }

      for (const failure of result.failed) {
        toast.error(t('failedToAddContributor', { username: failure.username, reason: failure.reason }));
      }

      const failedUsernames = new Set(result.failed.map((failure) => failure.username));
      setSelectedUsers(result.failed.map((failure) => failure.username));
      setSearchQuery(result.failed.length > 0 ? searchQuery : '');
      setSearchOpen(result.failed.length > 0);
      setSearchResultsOverride(searchResults.filter((user) => failedUsernames.has(user.username)));
    } catch (error: any) {
      if (error?.status === 409) {
        raiseContributorConflict(error?.detail || error?.message, async () => {
          await addContributors(selectedUsers, selectedUserObjects, {
            lastKnownUpdateDate: courseStructure.update_date,
          });
        });
        return;
      }
      console.error(t('errorAddingContributors'), error);
      toast.error(t('failedToAddContributorsGeneral'));
    } finally {
      setIsAdding(false);
    }
  };

  const updateContributor = async (
    contributorId: number,
    data: { authorship?: ContributorRole; authorship_status?: ContributorStatus },
  ) => {
    try {
      const currentContributor = contributors.find((c) => c.user_id === contributorId);
      if (!currentContributor) return;
      if (currentContributor.authorship === 'CREATOR') {
        toast.error(t('cannotModifyCreator'));
        return;
      }
      const updatedData = {
        authorship: data.authorship || currentContributor.authorship,
        authorship_status: data.authorship_status || currentContributor.authorship_status,
      };
      const res = await updateContributorMutation(contributorId, updatedData, {
        lastKnownUpdateDate: courseStructure.update_date,
      });

      if (res.status === 200 && res.data?.status === 'success') {
        toast.success(res.data.detail || t('successfullyUpdatedContributor'));
      } else {
        toast.error(res.data?.detail || t('failedToUpdateContributor'));
      }
    } catch (error: any) {
      if (error?.status === 409) {
        raiseContributorConflict(error?.detail || error?.message, async () => {
          await updateContributorMutation(
            contributorId,
            {
              authorship:
                data.authorship ||
                contributors.find((contributor) => contributor.user_id === contributorId)?.authorship,
              authorship_status:
                data.authorship_status ||
                contributors.find((contributor) => contributor.user_id === contributorId)?.authorship_status,
            },
            {
              lastKnownUpdateDate: courseStructure.update_date,
            },
          );
        });
        return;
      }
      toast.error(t('errorUpdatingContributor'));
    }
  };

  const getStatusStyle = (status: ContributorStatus): string => {
    switch (status) {
      case 'ACTIVE': {
        return `${getCourseWorkflowToneClass('success')} hover:bg-muted`;
      }
      case 'INACTIVE': {
        return `${getCourseWorkflowToneClass('info')} hover:bg-muted`;
      }
      case 'PENDING': {
        return `${getCourseWorkflowToneClass('warning')} hover:bg-accent`;
      }
      default: {
        return `${getCourseWorkflowToneClass('info')} hover:bg-muted`;
      }
    }
  };

  const handleContributorSelect = (userId: number) => {
    setSelectedContributors((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleBulkRemove = async () => {
    if (selectedContributors.length === 0) return;

    try {
      const selectedContributorRows = contributors.filter((c) => selectedContributors.includes(c.user_id));
      const selectedUsernames = selectedContributorRows.map((c) => c.user.username);
      const selectedUserIds = selectedContributorRows
        .filter((c) => selectedContributors.includes(c.user_id))
        .map((c) => c.user_id);
      const response = await removeContributors(selectedUsernames, selectedUserIds, {
        lastKnownUpdateDate: courseStructure.update_date,
      });
      const result = response.data as BulkAddResponse;

      if (result.successful.length > 0) {
        toast.success(t('successfullyRemovedContributors', { count: result.successful.length }));
      }

      for (const failure of result.failed) {
        toast.error(t('failedToRemoveContributor', { username: failure.username, reason: failure.reason }));
      }

      const failedUsernames = new Set(result.failed.map((failure) => failure.username));
      setSelectedContributors(
        contributors
          .filter((contributor) => failedUsernames.has(contributor.user.username))
          .map((contributor) => contributor.user_id),
      );
    } catch (error: any) {
      if (error?.status === 409) {
        raiseContributorConflict(error?.detail || error?.message, async () => {
          const retryRows = contributors.filter((contributor) => selectedContributors.includes(contributor.user_id));
          await removeContributors(
            retryRows.map((contributor) => contributor.user.username),
            retryRows.map((contributor) => contributor.user_id),
            {
              lastKnownUpdateDate: courseStructure.update_date,
            },
          );
        });
        return;
      }
      console.error(t('errorRemovingContributors'), error);
      toast.error(t('failedToRemoveContributorsGeneral'));
    }
  };

  const handleConfirmBulkRemove = async () => {
    setIsRemoveConfirmOpen(false);
    await handleBulkRemove();
  };

  const handleContributorAccessSave = async () => {
    if (isOpenToContributors === undefined || !isDirty) return;
    await save(async () =>
      updateAccess(
        { open_to_contributors: isOpenToContributors },
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
        title={t('courseContributorsTitle')}
        description={t('courseContributorsSubtitle')}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleContributorAccessSave}
        onDiscard={handleDiscard}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('courseContributorsTitle')}</CardTitle>
          <Alert className="border-border bg-muted/40">
            <UserPen className="size-4" />
            <AlertTitle>{t('contributorPolicyStagedTitle')}</AlertTitle>
            <AlertDescription>{t('contributorPolicyStagedDescription')}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={isOpenToContributors === true ? 'open' : isOpenToContributors === false ? 'closed' : undefined}
            onValueChange={(val) => setIsOpenToContributors(val === 'open')}
            disabled={isSaving}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <CourseChoiceCard
              id="contrib-open"
              value="open"
              checked={isOpenToContributors === true}
              title={t('openToContributorsTitle')}
              description={t('openToContributorsDescription')}
              icon={UserPen}
              disabled={isSaving}
              onSelect={(value) => setIsOpenToContributors(value === 'open')}
            />

            <CourseChoiceCard
              id="contrib-closed"
              value="closed"
              checked={isOpenToContributors === false}
              title={t('closeToContributorsTitle')}
              description={t('closeToContributorsDescription')}
              icon={Users}
              disabled={isSaving}
              onSelect={(value) => setIsOpenToContributors(value === 'open')}
            />
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('manageContributorsTitle')}</CardTitle>
          <Alert className="border-border bg-muted/40">
            <Users className="size-4" />
            <AlertTitle>{t('rosterActionsImmediateTitle')}</AlertTitle>
            <AlertDescription>{t('rosterActionsImmediateDescription')}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Popover
              open={searchOpen}
              onOpenChange={setSearchOpen}
            >
              <PopoverTrigger
                render={(triggerProps) => (
                  <div className="relative w-full">
                    <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                    <Input
                      {...triggerProps}
                      className="pl-8"
                      placeholder={t('searchUsersPlaceholder')}
                      value={searchQuery}
                      onFocus={() => setSearchOpen(true)}
                      onChange={(e) => {
                        const nextQuery = e.target.value;
                        setSearchQuery(nextQuery);
                        setSearchResultsOverride(null);
                        if (nextQuery.trim()) setSearchOpen(true);
                        else setSearchOpen(false);
                      }}
                    />
                  </div>
                )}
                nativeButton={false}
              />
              <PopoverContent
                className="w-(--anchor-width) p-0"
                align="start"
              >
                <Command>
                  <CommandList>
                    {isSearching ? (
                      <div className="text-muted-foreground p-4 text-center text-sm">{t('searchingMessage')}</div>
                    ) : (
                      <>
                        <CommandEmpty>{t('noUsersFoundMessage')}</CommandEmpty>
                        <CommandGroup>
                          {searchResults.map((user) => {
                            const isSelected = selectedUsers.includes(user.username);
                            const isExisting = contributors.some((c) => c.user.username === user.username);
                            return (
                              <CommandItem
                                key={user.username}
                                value={user.username}
                                disabled={isExisting}
                                onSelect={() => !isExisting && handleUserSelect(user.username)}
                                className="flex items-center gap-3 py-3"
                              >
                                <Checkbox
                                  checked={isSelected}
                                  disabled={isExisting}
                                  className="shrink-0"
                                />
                                <UserAvatar
                                  size="sm"
                                  avatar_url={user.avatar_url}
                                  predefined_avatar={user.avatar_image ? undefined : 'empty'}
                                  userId={user.id}
                                  showProfilePopup
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-foreground truncate font-medium">
                                    {[user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')}
                                  </div>
                                  <div className="text-muted-foreground text-xs">@{user.username}</div>
                                </div>
                                {isExisting && (
                                  <span className="bg-muted text-muted-foreground shrink-0 rounded border px-2 py-0.5 text-xs">
                                    {t('alreadyContributorMessage')}
                                  </span>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedUsers.length > 0 && (
              <div className={courseWorkflowMutedPanelClass + ' flex items-center justify-between'}>
                <span className="text-foreground text-sm">
                  {t('usersSelectedMessage', { count: selectedUsers.length })}
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedUsers([])}
                    variant="outline"
                    size="sm"
                  >
                    {t('clearButton')}
                  </Button>
                  <Button
                    onClick={handleAddContributors}
                    size="sm"
                    disabled={isAdding}
                  >
                    {t('addSelectedButton')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl border">
            {selectedContributors.length > 0 && (
              <div className="bg-muted/60 flex items-center justify-between rounded-t-xl border-b px-4 py-3">
                <span className="text-foreground text-sm">
                  {t('contributorsSelectedMessage', { count: selectedContributors.length })}
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedContributors([])}
                    variant="outline"
                    size="sm"
                  >
                    {t('clearButton')}
                  </Button>
                  <Button
                    onClick={() => setIsRemoveConfirmOpen(true)}
                    variant="destructive"
                    size="sm"
                  >
                    {t('removeSelectedButton')}
                  </Button>
                </div>
              </div>
            )}

            <AlertDialog
              open={isRemoveConfirmOpen}
              onOpenChange={setIsRemoveConfirmOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-muted text-foreground">
                    <Users className="size-8" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    {t('removeSelectedConfirmTitle', { count: selectedContributors.length })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('removeSelectedConfirmMessage', { count: selectedContributors.length })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel />
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleConfirmBulkRemove}
                  >
                    {t('removeSelectedButton')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {isContributorsLoading ? (
              <div className="text-muted-foreground px-4 py-6 text-center text-sm">{t('loadingContributors')}</div>
            ) : (
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]">
                        <Checkbox
                          checked={masterCheckboxChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedContributors(
                                contributors.filter((c) => c.authorship !== 'CREATOR').map((c) => c.user_id),
                              );
                            } else {
                              setSelectedContributors([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-[50px]" />
                      <TableHead>{t('nameColumn')}</TableHead>
                      <TableHead>{t('usernameColumn')}</TableHead>
                      <TableHead>{t('emailColumn')}</TableHead>
                      <TableHead>{t('roleColumn')}</TableHead>
                      <TableHead>{t('statusColumn')}</TableHead>
                      <TableHead>{t('addedOnColumn')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortContributors(contributors).map((contributor) => (
                      <TableRow
                        key={`${contributor.user_id}-${contributor.id}`}
                        className={`${selectedContributors.includes(contributor.user_id) ? 'bg-muted/60' : ''} ${
                          contributor.authorship !== 'CREATOR' ? 'hover:bg-muted/50 cursor-pointer' : ''
                        }`}
                        onClick={(e) => {
                          if (
                            e.target instanceof HTMLElement &&
                            (e.target.closest('button') || e.target.closest('input[type="checkbox"]'))
                          ) {
                            return;
                          }
                          if (contributor.authorship !== 'CREATOR') {
                            handleContributorSelect(contributor.user_id);
                          }
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedContributors.includes(contributor.user_id)}
                            onCheckedChange={() => handleContributorSelect(contributor.user_id)}
                            disabled={contributor.authorship === 'CREATOR'}
                          />
                        </TableCell>
                        <TableCell>
                          <UserAvatar
                            size="sm"
                            variant="outline"
                            avatar_url={
                              contributor.user.avatar_image
                                ? getUserAvatarMediaDirectory(contributor.user.user_uuid, contributor.user.avatar_image)
                                : ''
                            }
                            predefined_avatar={contributor.user.avatar_image === '' ? 'empty' : undefined}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {[contributor.user.first_name, contributor.user.middle_name, contributor.user.last_name]
                            .filter(Boolean)
                            .join(' ')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">@{contributor.user.username}</TableCell>
                        <TableCell className="text-muted-foreground">{contributor.user.email}</TableCell>
                        <TableCell>
                          <RoleDropdown
                            contributor={contributor}
                            updateContributor={updateContributor}
                            t={t}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusDropdown
                            contributor={contributor}
                            updateContributor={updateContributor}
                            t={t}
                            getStatusStyle={getStatusStyle}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(contributor.creation_date, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditCourseContributors;
