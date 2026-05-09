
import PlatformSettingsClient from './client';

export default async function PlatformSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const { subpage } = await props.params;
  return <PlatformSettingsClient subpage={subpage} />;
}
