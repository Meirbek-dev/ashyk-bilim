import PlatformUsersSettingsClient from './client';

export default async function PlatformUsersSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const { subpage } = await props.params;
  return <PlatformUsersSettingsClient subpage={subpage} />;
}
