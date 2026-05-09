'use client';

import { NativeSelect, NativeSelectOption } from '@components/ui/native-select';
import { linkResourcesToUserGroup } from '@services/usergroups/usergroups';
import { getAbsoluteUrl } from '@services/config/config';
import { useCourse } from '@components/Contexts/CourseContext';
import { useUserGroups } from '@/features/users/hooks/useUsers';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface UserGroup {
  id: number;
  name: string;
  description?: string;
}

interface LinkToUserGroupProps {
  setUserGroupModal: (open: boolean) => void;
}

const LinkToUserGroup = (props: LinkToUserGroupProps) => {
  const t = useTranslations('Components.LinkToUserGroup');
  const course = useCourse();
  const { courseStructure } = course;

  const { data: usergroups } = useUserGroups({ enabled: Boolean(courseStructure) });
  const [selectedUserGroup, setSelectedUserGroup] = useState<number | null>(null);

  // Use first usergroup as default if not explicitly set
  const effectiveUserGroup = selectedUserGroup ?? usergroups?.[0]?.id ?? null;

  const usergroupItems = (usergroups || []).map((group: UserGroup) => ({
    value: String(group.id),
    label: group.name,
  }));

  const handleLink = async () => {
    if (!effectiveUserGroup) {
      toast.error(t('selectUserGroupFirst'));
      return;
    }

    try {
      const res = await linkResourcesToUserGroup(effectiveUserGroup, courseStructure.course_uuid, {
        courseUuid: courseStructure.course_uuid,
      });
      if (res.status === 200) {
        props.setUserGroupModal(false);
        toast.success(t('linkSuccess'));
        await course.refreshEditorData();
      } else {
        toast.error(t('linkError', { error: res.data?.detail || t('unknownError') }));
      }
    } catch {
      toast.error(t('linkError', { error: t('unknownError') }));
    }
  };

  return (
    <div className="flex flex-col space-y-1">
      <div className="mx-auto mt-3 flex w-fit items-center space-x-2 rounded-full bg-yellow-100 px-4 py-2 text-sm text-yellow-900">
        <Info size={19} />
        <h1 className="font-medium">{t('infoMessage')}</h1>
      </div>
      <div className="flex flex-row items-center justify-between p-4">
        {usergroups?.length >= 1 && (
          <div className="py-1">
            <span className="ml-0.5 rounded-full bg-gray-100 px-3 py-1 font-bold text-gray-500">
              {t('userGroupNameLabel')}
            </span>

            <NativeSelect
              onChange={(event) => setSelectedUserGroup(Number(event.target.value))}
              value={effectiveUserGroup?.toString()}
              className="mx-5 mt-2 w-fit min-w-32"
              aria-label={t('selectUserGroup')}
            >
              {usergroupItems.map((group: { value: string; label: string }) => (
                <NativeSelectOption
                  key={group.value}
                  value={group.value}
                >
                  {group.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        {usergroups?.length === 0 && (
          <div className="flex items-center space-x-3">
            <span className="mx-3 rounded-full px-3 py-1 font-semibold text-yellow-700">
              {t('noUserGroupsAvailable')}
            </span>
            <Link
              className="mx-1 rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700"
              target="_blank"
              href={getAbsoluteUrl('/dash/users/settings/usergroups')}
            >
              {t('createUserGroupLink')}
            </Link>
          </div>
        )}
        <div className="py-3">
          <button
            onClick={() => {
              handleLink();
            }}
            className="rounded-md bg-green-700 px-4 py-2 font-bold text-white shadow-sm"
          >
            {t('linkButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkToUserGroup;
