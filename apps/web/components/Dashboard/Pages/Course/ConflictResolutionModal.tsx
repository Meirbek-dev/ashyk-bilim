'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCourse } from '@components/Contexts/CourseContext';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useCourseEditorStore } from '@/stores/courses';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function ConflictAlert() {
  const t = useTranslations('CourseEdit.Conflict');
  const { refreshCourseMeta } = useCourse();
  const conflict = useCourseEditorStore((state) => state.conflict);
  const dismissConflict = useCourseEditorStore((state) => state.dismissConflict);
  const saveAnyway = useCourseEditorStore((state) => state.saveAnyway);

  if (!conflict.isOpen) return null;

  const handleReload = async () => {
    dismissConflict();
    await refreshCourseMeta();
  };

  return (
    <Alert className="border-destructive/50 bg-destructive/5 mx-4 mb-4 lg:mx-8">
      <AlertTriangle className="text-destructive size-4" />
      <AlertTitle className="text-destructive">{t('title')}</AlertTitle>
      <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground text-sm">{conflict.message || t('description')}</span>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReload}
          >
            {t('reloadButton')}
          </Button>
          {conflict.pendingSave ? (
            <Button
              size="sm"
              onClick={() => void saveAnyway()}
            >
              <RefreshCcw className="mr-2 size-3" />
              {t('saveAnywayButton')}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
