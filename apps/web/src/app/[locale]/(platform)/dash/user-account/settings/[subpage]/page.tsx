import PlatformUserSettingsClient from './client';

export default async function PlatformUserSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const { subpage } = await props.params;
  return <PlatformUserSettingsClient subpage={subpage} />;
}
