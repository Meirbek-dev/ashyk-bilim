'use client';

import TypeOfContentTitle from '@/components/Objects/Elements/Titles/TypeOfContentTitle';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { Actions, Resources, Scopes } from '@/components/Security';
import { useSession } from '@/hooks/useSession';
import CreateCourseTrigger from '@/components/Landings/CreateCourseTrigger';
import CourseGridClient from '@components/Landings/CourseGridClient';

import { useTranslations } from 'next-intl';

interface CourseProps {
  courses: any[];
  totalCourses: number;
}

const EmptyStateMessage = ({ canManagePlatform, t, createCourseTrigger }: any) => (
  <div className="col-span-full flex items-center justify-center py-12">
    <div className="max-w-md text-center">
      <div className="mb-6">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
      </div>
      <h1 className="mb-3 text-2xl font-bold text-gray-700">{t('noCourses')}</h1>
      <p className="mb-6 text-lg text-gray-500">{canManagePlatform ? t('createACourse') : t('noCoursesAvailable')}</p>
      {canManagePlatform ? <div className="flex justify-center">{createCourseTrigger}</div> : null}
    </div>
  </div>
);

const Courses = (props: CourseProps) => {
  const t = useTranslations('CoursesPage');
  const { courses, totalCourses } = props;
  const { can } = useSession();
  const canManagePlatform = can(Resources.PLATFORM, Actions.MANAGE, Scopes.OWN);

  const createCourseTrigger = <CreateCourseTrigger />;

  const hasCourses = courses.length > 0 || totalCourses > 0;

  return (
    <div className="w-full">
      <GeneralWrapper>
        <div className="mb-2 flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <TypeOfContentTitle
              title={t('title')}
              type="cou"
            />
            {createCourseTrigger}
          </div>

          {!hasCourses ? (
            <EmptyStateMessage
              canManagePlatform={canManagePlatform}
              t={t}
              createCourseTrigger={createCourseTrigger}
            />
          ) : (
            <CourseGridClient
              initialCourses={courses}
              initialTotal={totalCourses}
            />
          )}
        </div>
      </GeneralWrapper>
    </div>
  );
};

export default Courses;
