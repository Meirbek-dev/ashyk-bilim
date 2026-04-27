'use client';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, BookX, EllipsisVertical, Eye, Layers2, Monitor, Pencil, UserRoundPen } from 'lucide-react';
import EditAssignmentModal from '@components/Objects/Modals/Activities/Assignments/EditAssignmentModal';
import { AssignmentProvider, useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import BreadCrumbs from '@components/Dashboard/Misc/BreadCrumbs';
import { updateActivity } from '@services/courses/activities';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useParams, useSearchParams } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';

import AssignmentEditorSubPage from './subpages/AssignmentEditorSubPage';

// Lazy Loading

const AssignmentSubmissionsSubPage = dynamic(() => import('./subpages/AssignmentSubmissionsSubPage'));

const AssignmentEdit = () => {
  const t = useTranslations('DashPage.Assignments.AssignmentPage');
  const params = useParams<{ assignmentuuid: string }>();
  const searchParams = useSearchParams();
  const [selectedSubPage, setSelectedSubPage] = useState(searchParams.get('subpage') || 'editor');
  const isMobile = useIsMobile();

  if (isMobile) {
    // TODO: Work on a better mobile experience
    return (
      <div className="bg-muted flex h-screen w-full items-center justify-center p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md">
          <h2 className="mb-4 text-xl font-bold">{t('desktopOnlyTitle')}</h2>
          <Monitor
            className="mx-auto my-5"
            size={60}
          />
          <p>{t('desktopOnlyMessage1')}</p>
          <p>{t('desktopOnlyMessage2')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col">
      <AssignmentProvider assignment_uuid={`assignment_${params.assignmentuuid}`}>
        <div className="soft-shadow z-10 flex shrink-0 flex-col bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.06)]">
          <div className="mr-10 flex h-full justify-between">
            <div className="mr-10 pl-10 tracking-tighter">
              <BrdCmpx />
              <div className="flex w-100 justify-between">
                <div className="flex text-2xl font-bold">
                  <div className="flex items-center gap-2">{t('assignmentTools')}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center antialiased">
              <PublishingState />
            </div>
          </div>
          <div className="mr-10 flex space-x-2 pt-2 pl-10 text-sm font-semibold tracking-tight">
            <div
              onClick={() => {
                setSelectedSubPage('editor');
              }}
              className={`border-primary flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                selectedSubPage === 'editor' ? 'border-b-4' : 'opacity-50'
              } cursor-pointer`}
            >
              <div className="mx-2 flex items-center space-x-2.5">
                <Layers2 size={16} />
                <div>{t('editor')}</div>
              </div>
            </div>
            <div
              onClick={() => {
                setSelectedSubPage('submissions');
              }}
              className={`border-primary flex w-fit space-x-4 py-2 text-center transition-all ease-linear ${
                selectedSubPage === 'submissions' ? 'border-b-4' : 'opacity-50'
              } cursor-pointer`}
            >
              <div className="mx-2 flex items-center space-x-2.5">
                <UserRoundPen size={16} />
                <div>{t('submissions')}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 w-full flex-1">
          {selectedSubPage === 'editor' && <AssignmentEditorSubPage assignmentuuid={params.assignmentuuid} />}
          {selectedSubPage === 'submissions' && (
            <AssignmentSubmissionsSubPage assignment_uuid={params.assignmentuuid} />
          )}
        </div>
      </AssignmentProvider>
    </div>
  );
};

export default AssignmentEdit;

const BrdCmpx = () => {
  const assignment = useAssignments();

  return (
    <BreadCrumbs
      type="assignments"
      last_breadcrumb={assignment?.assignment_object?.title}
    />
  );
};

const PublishingState = () => {
  const queryClient = useQueryClient();
  const t = useTranslations('DashPage.Assignments.AssignmentPage');
  const assignment = useAssignments();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const isPublished = Boolean(assignment?.activity_object?.published);

  async function updateAssignmentPublishState(assignmentUUID: string) {
    const activityUUID = assignment?.activity_object?.activity_uuid;
    if (!activityUUID) return;

    const toast_loading = toast.loading(t('updateLoading'));
    const res = await updateActivity({ published: !isPublished }, activityUUID);
    if (res.success) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentUUID) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.activities.detail(activityUUID) });
      toast.success(t('updateSuccess'));
      toast.dismiss(toast_loading);
    } else {
      toast.error(t('updateError'));
    }
  }

  return (
    <>
      <div className="mx-auto mt-5 flex items-center space-x-4">
        <div
          className={`mx-auto flex rounded-full px-3.5 py-2 text-xs font-bold text-nowrap outline-1 ${!isPublished ? 'bg-gray-200/60 outline-gray-300' : 'bg-green-200/60 outline-green-300'}`}
        >
          {isPublished ? t('published') : t('unpublished')}
        </div>
        <div>
          <EllipsisVertical
            className="text-gray-500"
            size={13}
          />
        </div>

        <ToolTip
          side="left"
          slateBlack
          sideOffset={10}
          content={t('editDetailsTooltip')}
        >
          <div
            onClick={() => {
              setIsEditModalOpen(true);
            }}
            className="bg-background text-foreground hover:bg-accent flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-2 font-medium shadow-sm"
          >
            <Pencil size={18} />
            <p className="text-sm font-bold">{t('edit')}</p>
          </div>
        </ToolTip>

        <ToolTip
          side="left"
          slateBlack
          sideOffset={10}
          content={t('previewTooltip')}
        >
          <Link
            target="_blank"
            href={`/course/${assignment?.course_object?.course_uuid.replace('course_', '')}/activity/${assignment?.activity_object?.activity_uuid.replace('activity_', '')}`}
            className="bg-background text-foreground hover:bg-accent flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-2 font-medium shadow-sm"
          >
            <Eye size={18} />
            <p className="text-sm font-bold">{t('preview')}</p>
          </Link>
        </ToolTip>
        {isPublished ? (
          <ToolTip
            side="left"
            slateBlack
            sideOffset={10}
            content={t('unpublishTooltip')}
          >
            <div
              onClick={() => {
                if (assignment?.assignment_object?.assignment_uuid) {
                  updateAssignmentPublishState(assignment.assignment_object.assignment_uuid);
                }
              }}
              className="bg-background text-foreground hover:bg-accent flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-2 font-medium shadow-sm"
            >
              <BookX size={18} />
              <p className="text-sm font-bold">{t('unpublish')}</p>
            </div>
          </ToolTip>
        ) : null}
        {!isPublished && (
          <ToolTip
            side="left"
            slateBlack
            sideOffset={10}
            content={t('publishTooltip')}
          >
            <div
              onClick={() => {
                if (assignment?.assignment_object?.assignment_uuid) {
                  updateAssignmentPublishState(assignment.assignment_object.assignment_uuid);
                }
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex cursor-pointer items-center space-x-2 rounded-md px-3 py-2 font-medium shadow-sm"
            >
              <BookOpen size={18} />
              <p className="text-sm font-bold">{t('publish')}</p>
            </div>
          </ToolTip>
        )}
      </div>
      {isEditModalOpen && assignment?.assignment_object ? (
        <EditAssignmentModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
          }}
          assignment={assignment?.assignment_object}
        />
      ) : null}
    </>
  );
};
