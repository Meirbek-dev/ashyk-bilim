'use client';

/**
 * PreviewModeButton — Toggles student preview mode in the teacher studio.
 *
 * When active, the studio renders the student attempt experience without
 * creating a real submission.
 */

import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreviewModeButtonProps {
  isPreview: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export default function PreviewModeButton({ isPreview, onToggle, disabled = false }: PreviewModeButtonProps) {
  return (
    <Button
      variant={isPreview ? 'default' : 'outline'}
      size="sm"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isPreview}
    >
      {isPreview ? <EyeOff className="mr-1.5 size-3.5" /> : <Eye className="mr-1.5 size-3.5" />}
      {isPreview ? 'Exit Preview' : 'Preview'}
    </Button>
  );
}
