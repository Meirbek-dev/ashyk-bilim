'use client';

import { Download, Loader2 } from 'lucide-react';
import { downloadAnalyticsExport } from '@services/analytics/teacher';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

interface AnalyticsExportButtonProps {
  href: string;
  label: string;
}

export default function AnalyticsExportButton({ href, label }: AnalyticsExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const { blob, filename } = await downloadAnalyticsExport(href);
      const url = globalThis.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.download = filename;
      anchor.href = url;
      anchor.click();
      globalThis.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label}
    </Button>
  );
}
