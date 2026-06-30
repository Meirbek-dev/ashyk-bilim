import type { ReactNode } from 'react'

interface PlatformCourseWorkspaceLayoutProps {
  children: ReactNode
  params: Promise<{ courseuuid: string }>
}

export default function PlatformCourseWorkspaceLayout(props: PlatformCourseWorkspaceLayoutProps) {
  return <>{props.children}</>
}
