import AppSettingsClient from './client'

export default async function AppSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const { subpage } = await props.params
  return <AppSettingsClient subpage={subpage} />
}
