import CourseCreationWizard from '@components/Dashboard/Courses/CourseCreationWizard';

export default function PlatformNewCoursePage() {
  // No server-side course preloading: the outline template uses an async
  // combobox that queries courses on demand as the user types.
  return <CourseCreationWizard />;
}
