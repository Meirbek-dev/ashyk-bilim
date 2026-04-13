'use client';

import { useExamDetail, useUpdateExamSettings } from '@/features/exams/hooks/useExam';
import { useCourseContributors } from '@/hooks/courses/useCourseContributors';

import { useEffect, useMemo, useState } from 'react';
import { Search, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Checkbox } from '@components/ui/checkbox';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';

interface Student {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
}

interface WhitelistManagementProps {
  examUuid: string;
  courseUuid: string;
  currentWhitelist: number[];
  onWhitelistUpdated: () => void;
}

export default function WhitelistManagement({
  examUuid,
  courseUuid,
  currentWhitelist,
  onWhitelistUpdated,
}: WhitelistManagementProps) {
  const t = useTranslations('Components.WhitelistManagement');
  const [selectedUserIds, setSelectedUserIds] = useState(new Set(currentWhitelist));
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedCourseUuid = courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`;
  const contributorsQuery = useCourseContributors(normalizedCourseUuid);
  const { data: examData, refetch: refetchExam } = useExamDetail(examUuid);
  const updateExamSettingsMutation = useUpdateExamSettings(examUuid);
  const isLoading = contributorsQuery.isPending;
  const isSaving = updateExamSettingsMutation.isPending;
  const students = useMemo<Student[]>(() => {
    const contributors = Array.isArray(contributorsQuery.data?.data) ? contributorsQuery.data.data : [];

    return contributors.map((contributor: any) => ({
      id: contributor.user_id,
      user_id: contributor.user_id,
      user_name:
        (contributor.user && ((contributor.user.first_name || '') + ' ' + (contributor.user.last_name || '')).trim()) ||
        contributor.user?.username ||
        contributor.user?.email ||
        'Unknown',
      user_email: contributor.user?.email || '',
    }));
  }, [contributorsQuery.data?.data]);

  useEffect(() => {
    if (contributorsQuery.error) {
      console.error('Error fetching students:', contributorsQuery.error);
      toast.error(t('errorFetchingStudents'));
    }
  }, [contributorsQuery.error, t]);

  useEffect(() => {
    setSelectedUserIds(new Set(currentWhitelist));
  }, [currentWhitelist]);

  const handleToggleStudent = (userId: number) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedUserIds(new Set(filteredStudents.map((s) => s.user_id)));
  };

  const handleDeselectAll = () => {
    setSelectedUserIds(new Set());
  };

  const handleSaveWhitelist = async () => {
    try {
      const latestExamData = (examData ?? (await refetchExam()).data) as
        | { settings?: Record<string, unknown> }
        | undefined;

      if (!latestExamData) throw new Error('Failed to fetch exam settings');
      const existingSettings = latestExamData.settings || {};

      // Merge and ensure access mode is WHITELIST so changes persist and the whitelist is effective,
      const mergedSettings = {
        ...existingSettings,
        whitelist_user_ids: [...selectedUserIds],
        access_mode: existingSettings.access_mode === 'WHITELIST' ? 'WHITELIST' : 'WHITELIST',
      };

      await updateExamSettingsMutation.mutateAsync(mergedSettings);

      // If access_mode was not WHITELIST before, inform the user that it has been set,
      if (existingSettings.access_mode !== 'WHITELIST') {
        toast.success(t('whitelistUpdated') + '. ' + t('accessModeSetToWhitelist'));
      } else {
        toast.success(t('whitelistUpdated'));
      }

      onWhitelistUpdated();
    } catch (error) {
      console.error('Error updating whitelist:', error);
      toast.error(t('errorUpdatingWhitelist'));
    }
  };

  const filteredStudents = students.filter(
    (student) =>
      student.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.user_email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">{t('loadingStudents')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('manageWhitelist')}</CardTitle>
        <CardDescription>{t('whitelistDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t('searchStudents')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            {t('selectAll')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeselectAll}
          >
            <UserX className="mr-2 h-4 w-4" />
            {t('deselectAll')}
          </Button>
        </div>

        {/* Selected Count */}
        <div className="text-muted-foreground text-sm">
          {t('selectedCount', { count: selectedUserIds.size, total: students.length })}
        </div>

        {/* Student List */}
        <div className="max-h-[400px] space-y-2 overflow-y-auto rounded-md border p-4">
          {filteredStudents.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">{t('noStudentsFound')}</p>
          ) : (
            filteredStudents.map((student) => (
              <div
                key={student.user_id}
                className="hover:bg-muted flex items-center space-x-2 rounded-md p-2"
              >
                <Checkbox
                  id={`student-${student.user_id}`}
                  checked={selectedUserIds.has(student.user_id)}
                  onCheckedChange={() => handleToggleStudent(student.user_id)}
                />
                <Label
                  htmlFor={`student-${student.user_id}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="font-medium">{student.user_name}</div>
                  <div className="text-muted-foreground text-sm">{student.user_email}</div>
                </Label>
              </div>
            ))
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSaveWhitelist}
            disabled={isSaving}
          >
            {isSaving ? t('saving') : t('saveWhitelist')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
