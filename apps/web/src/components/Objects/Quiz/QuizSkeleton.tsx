'use client';

import { Skeleton } from '@components/ui/skeleton';

export default function QuizSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((q) => (
        <div
          key={q}
          className="space-y-3"
        >
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3].map((o) => (
            <Skeleton
              key={o}
              className="h-12 w-full"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
