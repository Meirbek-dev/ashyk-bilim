'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ForecastItem } from '@/types/analytics';
import { TrendingUp } from 'lucide-react';

interface ForecastingPanelProps {
  forecasts: ForecastItem[];
}

export default function ForecastingPanel({ forecasts }: ForecastingPanelProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <CardTitle>Forecasts</CardTitle>
        </div>
        <CardDescription>Completion, grading, and assessment risks projected from current pace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {forecasts.slice(0, 8).map((item) => (
          <div
            key={item.id}
            className="bg-muted rounded-lg border p-4"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'}>
                {item.severity}
              </Badge>
              <Badge variant="outline">{item.confidence_level} confidence</Badge>
            </div>
            <div className="text-foreground font-medium">{item.title}</div>
            <div className="text-muted-foreground mt-1 text-sm leading-6">{item.prediction}</div>
          </div>
        ))}
        {!forecasts.length ? <div className="text-muted-foreground text-sm">No forecast risks for this filter.</div> : null}
      </CardContent>
    </Card>
  );
}
