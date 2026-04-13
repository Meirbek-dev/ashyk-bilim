import { redirect } from 'next/navigation';

export default async function PlatformCourseCollaborationPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params;
  redirect(`/dash/courses/${courseuuid}/access`);
}
