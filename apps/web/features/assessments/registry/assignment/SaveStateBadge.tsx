'use client';

import { LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export default function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'dirty') return <Badge variant="secondary">Unsaved</Badge>;
  if (state === 'saving')
    return (
      <Badge variant="secondary">
        <LoaderCircle className="size-3 animate-spin" />
        Saving
      </Badge>
    );
  if (state === 'error') return <Badge variant="destructive">Save failed</Badge>;
  return <Badge variant="success">Saved</Badge>;
}
