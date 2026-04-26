'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnomalyItem } from '@/types/analytics';
import { Activity } from 'lucide-react';

interface AnomalyPanelProps {
  anomalies: AnomalyItem[];
}

export default function AnomalyPanel({ anomalies }: AnomalyPanelProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <CardTitle>Anomalies</CardTitle>
        </div>
        <CardDescription>Abnormal engagement, submissions, quiz timing, and score distribution shifts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {anomalies.slice(0, 8).map((item) => (
          <div
            key={item.id}
            className="bg-muted rounded-lg border p-4"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'}>
                {item.severity}
              </Badge>
              <span className="text-muted-foreground text-xs tracking-wider uppercase">{item.type.replaceAll('_', ' ')}</span>
            </div>
            <div className="text-foreground font-medium">{item.title}</div>
            <div className="text-muted-foreground mt-1 text-sm leading-6">{item.detail}</div>
          </div>
        ))}
        {!anomalies.length ? <div className="text-muted-foreground text-sm">No anomalies detected for this filter.</div> : null}
      </CardContent>
    </Card>
  );
}
