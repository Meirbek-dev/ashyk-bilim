'use client';

import { BookPlus, BookUser, FileUp, Forward, InfoIcon, ListTodo, Save, Type } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { Alert, AlertDescription } from '@components/ui/alert';
import { CardContent, CardHeader } from '@components/ui/card';
import { Separator } from '@components/ui/separator';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

// Type definitions
type AssignmentType = 'quiz' | 'file' | 'form';
type ViewMode = 'teacher' | 'student' | 'grading' | 'custom-grading';

interface AssignmentBoxProps {
  type: AssignmentType;
  view?: ViewMode;
  maxPoints?: number;
  currentPoints?: number;
  /** Pass true when the student already has a submission — hides the submit button. */
  hasExistingSubmission?: boolean;
  saveFC?: () => void;
  submitFC?: () => void;
  gradeFC?: () => void;
  gradeCustomFC?: (grade: number) => void;
  showSavingDisclaimer?: boolean;
  children: ReactNode;
}

const AssignmentBoxUI = ({
  type,
  view = 'student',
  currentPoints = 0,
  maxPoints,
  hasExistingSubmission = false,
  saveFC,
  submitFC,
  gradeFC,
  gradeCustomFC,
  showSavingDisclaimer = false,
  children,
}: AssignmentBoxProps) => {
  const t = useTranslations('Activities.AssignmentBoxUI');
  const [customGrade, setCustomGrade] = useState('');
  const { isAuthenticated } = useSession();
  const showStudentSubmitButton = view === 'student' && isAuthenticated && !hasExistingSubmission;

  const handleCustomGradeSubmit = () => {
    if (!gradeCustomFC || !customGrade) return;

    const grade = Number.parseInt(customGrade, 10);
    if (Number.isNaN(grade) || grade < 0 || grade > 100) {
      toast.error(t('gradeRangeError', { maxGradeValue: 100 }));
      return;
    }

    if (maxPoints && grade > maxPoints) {
      toast.error(t('gradeRangeError', { maxGradeValue: Math.min(maxPoints, 100) }));
      return;
    }

    gradeCustomFC(grade);
  };

  const handleCustomGradeChange = (value: string) => {
    // Only allow valid number input
    if (value === '' || /^\d+$/.test(value)) {
      setCustomGrade(value);
    }
  };

  return (
    <div>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left side - Type and badges */}
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge
              type={type}
              t={t}
            />
            <Separator
              orientation="vertical"
              className="hidden h-5 sm:block"
            />
            {view === 'teacher' && <TeacherViewBadge t={t} />}
            {maxPoints !== undefined && (
              <PointsBadge
                points={maxPoints}
                t={t}
              />
            )}
          </div>

          {/* Right side - Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {showSavingDisclaimer && <SavingDisclaimerAlert t={t} />}

            {view === 'teacher' && (
              <TeacherActions
                saveFC={saveFC}
                t={t}
              />
            )}

            {showStudentSubmitButton && (
              <StudentActions
                submitFC={submitFC}
                t={t}
              />
            )}

            {view === 'grading' && (
              <GradingActions
                currentPoints={currentPoints}
                gradeFC={gradeFC}
                t={t}
              />
            )}

            {view === 'custom-grading' && maxPoints !== undefined && (
              <CustomGradingActions
                currentPoints={currentPoints}
                maxPoints={maxPoints}
                customGrade={customGrade}
                onGradeChange={handleCustomGradeChange}
                onSubmit={handleCustomGradeSubmit}
                t={t}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4">{children}</CardContent>
    </div>
  );
};

// Extracted sub-components for better organization

interface TypeBadgeProps {
  type: AssignmentType;
  t: ReturnType<typeof useTranslations>;
}

const TypeBadge = ({ type, t }: TypeBadgeProps) => {
  const config = {
    quiz: { icon: ListTodo, label: t('quizTitle') },
    file: { icon: FileUp, label: t('fileSubmissionTitle') },
    form: { icon: Type, label: t('formTitle') },
  };

  const { icon: Icon, label } = config[type];

  return (
    <div className="flex items-center gap-2 text-slate-700">
      <Icon className="h-4 w-4" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
};

interface TeacherViewBadgeProps {
  t: ReturnType<typeof useTranslations>;
}

const TeacherViewBadge = ({ t }: TeacherViewBadgeProps) => (
  <Badge
    variant="secondary"
    className="gap-1.5"
  >
    <BookUser className="h-3 w-3" />
    <span className="text-xs">{t('teacherView')}</span>
  </Badge>
);

interface PointsBadgeProps {
  points: number;
  t: ReturnType<typeof useTranslations>;
}

const PointsBadge = ({ points, t }: PointsBadgeProps) => (
  <Badge
    variant="success"
    className="gap-1.5"
  >
    <BookPlus className="h-3 w-3" />
    <span className="text-xs">{t('points', { count: points })}</span>
  </Badge>
);

interface SavingDisclaimerAlertProps {
  t: ReturnType<typeof useTranslations>;
}

const SavingDisclaimerAlert = ({ t }: SavingDisclaimerAlertProps) => (
  <Alert
    variant="destructive"
    className="py-2"
  >
    <InfoIcon className="h-4 w-4" />
    <AlertDescription className="text-xs font-medium">{t('savingDisclaimer')}</AlertDescription>
  </Alert>
);

interface TeacherActionsProps {
  saveFC?: () => void;
  t: ReturnType<typeof useTranslations>;
}

const TeacherActions = ({ saveFC, t }: TeacherActionsProps) => {
  if (!saveFC) return null;

  return (
    <Button
      onClick={saveFC}
      variant="secondary"
      size="sm"
      className="gap-2"
    >
      <Save className="h-4 w-4" />
      <span className="text-xs font-semibold">{t('save')}</span>
    </Button>
  );
};

interface StudentActionsProps {
  submitFC?: () => void;
  t: ReturnType<typeof useTranslations>;
}

const StudentActions = ({ submitFC, t }: StudentActionsProps) => {
  if (!submitFC) return null;

  return (
    <Button
      onClick={submitFC}
      variant="default"
      size="sm"
      className="w-full gap-2 sm:w-auto"
    >
      <Forward className="h-4 w-4" />
      <span className="text-xs font-semibold">{t('saveProgress')}</span>
    </Button>
  );
};

interface GradingActionsProps {
  currentPoints: number;
  gradeFC?: () => void;
  t: ReturnType<typeof useTranslations>;
}

const GradingActions = ({ currentPoints, gradeFC, t }: GradingActionsProps) => {
  if (!gradeFC) return null;

  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/50 p-1 sm:w-auto">
      <span className="px-2 text-xs font-semibold text-orange-700">
        {t('currentPoints', { points: currentPoints })}
      </span>
      <Button
        onClick={gradeFC}
        variant="ghost"
        size="sm"
        className="ml-auto gap-2 bg-orange-100 text-orange-700 hover:bg-orange-200 hover:text-orange-800"
      >
        <BookPlus className="h-4 w-4" />
        <span className="text-xs font-semibold">{t('grade')}</span>
      </Button>
    </div>
  );
};

interface CustomGradingActionsProps {
  currentPoints: number;
  maxPoints: number;
  customGrade: string;
  onGradeChange: (value: string) => void;
  onSubmit: () => void;
  t: ReturnType<typeof useTranslations>;
}

const CustomGradingActions = ({
  currentPoints,
  maxPoints,
  customGrade,
  onGradeChange,
  onSubmit,
  t,
}: CustomGradingActionsProps) => {
  const isValidGrade =
    customGrade !== '' &&
    !Number.isNaN(Number(customGrade)) &&
    Number(customGrade) >= 0 &&
    Number(customGrade) <= maxPoints;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50/50 p-2 sm:w-auto sm:flex-row sm:items-center">
      <span className="text-xs font-semibold text-orange-700">{t('currentPoints', { points: currentPoints })}</span>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={customGrade}
          onChange={(e) => onGradeChange(e.target.value)}
          placeholder={maxPoints.toString()}
          min={0}
          max={maxPoints}
          className="h-8 w-24 text-sm"
        />
        <Button
          onClick={onSubmit}
          disabled={!isValidGrade}
          variant="ghost"
          size="sm"
          className="gap-2 bg-orange-100 whitespace-nowrap text-orange-700 hover:bg-orange-200 hover:text-orange-800 disabled:opacity-50"
        >
          <BookPlus className="h-4 w-4" />
          <span className="text-xs font-semibold">{t('grade')}</span>
        </Button>
      </div>
    </div>
  );
};

export default AssignmentBoxUI;
