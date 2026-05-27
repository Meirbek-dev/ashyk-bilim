import AppUserSettingsClient from './client';

export default async function AppUserSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const { subpage } = await props.params;
  return <AppUserSettingsClient subpage={subpage} />;
}
