'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import NewActivityModal from '@components/Objects/Modals/Activities/Create/NewActivity';
import { useActivityMutations } from '@/hooks/mutations/useActivityMutations';
import { cleanActivityUuid, cleanCourseUuid } from '@/lib/course-management';
import { useCourse } from '@components/Contexts/CourseContext';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface NewActivityButtonProps {
  chapterId: number;
}

const NewActivityButton = (props: NewActivityButtonProps) => {
  const [newActivityModal, setNewActivityModal] = useState(false);
  const course = useCourse();
  const router = useRouter();
  const activityMutations = useActivityMutations(course.courseStructure.course_uuid, true);
  const t = useTranslations('CourseEdit.NewActivityModal');
  const tNotify = useTranslations('DashPage.Notifications');

  const closeNewActivityModal = async () => {
    setNewActivityModal(false);
  };

  const submitActivity = async (activity: any) => {
    const toast_loading = toast.loading(tNotify('creatingActivity'));
    try {
      const response = await activityMutations.createActivity(activity, props.chapterId);
      toast.success(tNotify('activityCreatedSuccess'));
      setNewActivityModal(false);
      return response;
    } catch (error: any) {
      toast.error(error?.message || tNotify('uploadFailed'));
      throw error;
    } finally {
      toast.dismiss(toast_loading);
    }
  };

  const submitFileActivity = async ({
    file,
    type,
    activity,
    chapterId,
  }: {
    file: any;
    type: any;
    activity: any;
    chapterId: number;
  }) => {
    const toast_loading = toast.loading(tNotify('uploadingAndCreating'));
    const courseUuid = course.courseStructure.course_uuid;
    const activityPayload = courseUuid ? { ...activity, course_uuid: activity?.course_uuid ?? courseUuid } : activity;

    try {
      await activityMutations.createFileActivity(file, type, activityPayload, chapterId, (progress) => {
        toast.loading(`${tNotify('uploadingAndCreating')} ${progress.percentage}%`, {
          id: toast_loading,
        });
      });

      setNewActivityModal(false);
      toast.dismiss(toast_loading);
      toast.success(tNotify('fileUploadSuccess'));
      toast.success(tNotify('activityCreatedSuccess'));
    } catch (error: any) {
      toast.dismiss(toast_loading);
      toast.error(error?.message || tNotify('uploadFailed'));
    }
  };

  const submitExternalVideo = async (external_video_data: any, activity: any) => {
    const toast_loading = toast.loading(tNotify('creatingActivity'));
    try {
      await activityMutations.createExternalVideo(external_video_data, activity, props.chapterId);
      setNewActivityModal(false);
      toast.success(tNotify('activityCreatedSuccess'));
    } catch (error: any) {
      toast.error(error?.message || tNotify('uploadFailed'));
    } finally {
      toast.dismiss(toast_loading);
    }
  };

  const createAndOpenActivity = async (kind: 'dynamic' | 'codechallenge') => {
    const activityPayload =
      kind === 'dynamic'
        ? {
            name: t('quickCreate.dynamicPageName'),
            chapter_id: props.chapterId,
            activity_type: 'TYPE_DYNAMIC',
            activity_sub_type: 'SUBTYPE_DYNAMIC_PAGE',
          }
        : {
            name: t('quickCreate.codeChallengeName'),
            chapter_id: props.chapterId,
            activity_type: 'TYPE_CODE_CHALLENGE',
            activity_sub_type: 'SUBTYPE_CODE_GENERAL',
            published: false,
            content: {
              description: '',
              difficulty: 'medium',
            },
          };

    const response = await submitActivity(activityPayload);
    const createdActivityUuid = response?.data?.activity_uuid;

    if (!createdActivityUuid) {
      return;
    }

    const cleanCourse = cleanCourseUuid(course.courseStructure.course_uuid);
    const cleanActivity = cleanActivityUuid(createdActivityUuid);
    const destination =
      kind === 'dynamic'
        ? `/course/${cleanCourse}/activity/${cleanActivity}/edit`
        : `/course/${cleanCourse}/activity/${cleanActivity}/editor`;

    router.push(destination);
  };

  return (
    <div className="flex justify-center">
      <Dialog
        open={newActivityModal}
        onOpenChange={setNewActivityModal}
      >
        <DialogTrigger render={<Button className="h-10" />}>
          <Plus className="h-3.5 w-3.5" />
          {t('title')}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-full min-w-fit overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900">{t('title')}</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">{t('description')}</DialogDescription>
          </DialogHeader>
          <NewActivityModal
            closeModal={closeNewActivityModal}
            submitFileActivity={submitFileActivity}
            submitExternalVideo={submitExternalVideo}
            submitActivity={submitActivity}
            createAndOpenActivity={createAndOpenActivity}
            chapterId={props.chapterId}
            course={course}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewActivityButton;
