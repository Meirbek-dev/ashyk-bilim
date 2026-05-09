/**
 * Consolidated Loading States
 *
 * Single, flexible skeleton component with content-aware variants.
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingStateProps {
  title?: string;
  variant?: 'profile' | 'stats' | 'list' | 'feed';
  itemCount?: number;
  className?: string;
}

export function LoadingState({ title, variant = 'list', itemCount = 5, className = '' }: LoadingStateProps) {
  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        {variant === 'profile' && <ProfileSkeletonContent />}
        {variant === 'stats' && <StatsSkeletonContent />}
        {variant === 'list' && <ListSkeletonContent itemCount={itemCount} />}
        {variant === 'feed' && <FeedSkeletonContent itemCount={itemCount} />}
      </CardContent>
    </Card>
  );
}

// Internal skeleton content components
function ProfileSkeletonContent() {
  return (
    <div className="flex items-start gap-4">
      <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}

function StatsSkeletonContent() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="space-y-2"
        >
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

function ListSkeletonContent({ itemCount }: { itemCount: number }) {
  return (
    <div className="space-y-3">
      {[...Array(itemCount)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedSkeletonContent({ itemCount }: { itemCount: number }) {
  return (
    <div className="space-y-4">
      {[...Array(itemCount)].map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
