'use client'

import { Suspense, lazy } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { AdminAnalyticsResponse } from '@/types/analytics'

const AdminAnalyticsPanel = lazy(() => import('./AdminAnalyticsPanel'))

const SectionFallback = ({ height = 'h-[280px]' }: { height?: string }) => (
  <Card className="shadow-sm border-border bg-card">
    <CardContent className={`${height} bg-muted animate-pulse rounded-lg`} />
  </Card>
)

interface AdminTabProps {
  adminData: AdminAnalyticsResponse
}

export default function AdminTab({ adminData }: AdminTabProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SectionFallback height="h-[520px]" />}>
        <AdminAnalyticsPanel data={adminData} />
      </Suspense>
    </div>
  )
}
