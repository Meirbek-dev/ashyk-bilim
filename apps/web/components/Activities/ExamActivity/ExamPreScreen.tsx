'use client';

import { apiFetch } from '@/lib/api-client';

import { AlertCircle, CheckCircle, CircleAlertIcon, Clock, FileText, InfinityIcon, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import { Button } from '@components/ui/button';

interface ExamPreScreenProps {
  exam: any;
  questionCount: number;
  userAttempts: any[];
  onStartExam: (attempt: any) => void;
  onReviewAttempt?: (attempt: any) => void;
  isTeacher?: boolean;
  onBackToManage?: () => void;
}

export default function ExamPreScreen({
  exam,
  questionCount,
  userAttempts,
  onStartExam,
  onReviewAttempt,
  isTeacher = false,
  onBackToManage,
}: ExamPreScreenProps) {
  const t = useTranslations('Activities.ExamActivity');
  const [isStarting, setIsStarting] = useState(false);

  const settings = exam.settings || {};
  const attemptLimit = settings.attempt_limit;
  const timeLimit = settings.time_limit;
  const remainingAttempts = isTeacher
    ? null
    : attemptLimit && attemptLimit > 0
      ? attemptLimit - userAttempts.length
      : null;

  // Teachers can always take exams (unlimited attempts for preview/testing)
  const canTakeExam = isTeacher || !attemptLimit || attemptLimit === 0 || userAttempts.length < attemptLimit;

  const handleStartExam = async () => {
    if (!canTakeExam) {
      toast.error(t('noAttemptsRemaining'));
      return;
    }

    setIsStarting(true);

    try {
      const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start exam');
      }

      const attempt = await response.json();
      toast.success(t('examStarted'));
      onStartExam(attempt);
    } catch (error: any) {
      console.error('Error starting exam:', error);
      toast.error(error.message || t('errorStartingExam'));
      setIsStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      {/* Page header with better visual hierarchy */}
      <div className="grid gap-8 lg:grid-cols-[1fr,380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">{exam.title}</CardTitle>
              <CardDescription className="text-base">{exam.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-8">
              {/* Exam Information with modern grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="border-border bg-card rounded-2xl border p-5 shadow-sm transition-colors hover:bg-muted/30">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-muted-foreground text-sm font-medium">{t('totalQuestions')}</p>
                      <p className="text-foreground mt-1 text-3xl font-bold">{questionCount}</p>
                    </div>
                  </div>
                </div>

                <div className="border-border bg-card rounded-2xl border p-5 shadow-sm transition-colors hover:bg-muted/30">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm">
                      <Clock className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-muted-foreground text-sm font-medium">{t('timeLimit')}</p>
                      <p className="text-foreground mt-1 text-3xl font-bold">
                        {timeLimit || <span className="text-2xl">{t('unlimited')}</span>}
                      </p>
                      {timeLimit && (
                        <p className="text-muted-foreground text-xs">{t('minutes', { count: timeLimit })}</p>
                      )}
                    </div>
                  </div>
                </div>

                {attemptLimit && attemptLimit > 0 && !isTeacher && (
                  <div className="border-border bg-card rounded-2xl border p-5 shadow-sm transition-colors hover:bg-muted/30">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                        <Users className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <p className="text-muted-foreground text-sm font-medium">{t('attemptsRemaining')}</p>
                        <p className="text-foreground mt-1 text-3xl font-bold">
                          {remainingAttempts !== null ? remainingAttempts : t('unlimited')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isTeacher && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                        <InfinityIcon />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900">{t('teacherPreview')}</p>
                        <p className="text-sm text-blue-700">{t('unlimitedAttempts')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions with modern design */}
              <div className="border-border bg-muted/30 space-y-5 rounded-2xl border p-6">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white">
                    <CircleAlertIcon className="m-1.5" />
                  </div>
                  <h3 className="text-foreground text-lg font-bold">{t('instructions')}</h3>
                </div>
                <ul className="space-y-3">
                  <li className="bg-card flex items-start gap-3 rounded-lg p-3 shadow-sm">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-foreground flex-1 text-sm leading-relaxed">{t('instruction1')}</span>
                  </li>
                  {timeLimit && (
                    <li className="bg-card flex items-start gap-3 rounded-lg p-3 shadow-sm">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="text-foreground flex-1 text-sm leading-relaxed">
                        {t('instruction3', { minutes: timeLimit })}
                      </span>
                    </li>
                  )}
                  <li className="bg-card flex items-start gap-3 rounded-lg p-3 shadow-sm">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="text-foreground flex-1 text-sm leading-relaxed">{t('instruction2')}</span>
                  </li>
                  {settings.tab_switch_detection && (
                    <li className="bg-card flex items-start gap-3 rounded-lg p-3 shadow-sm">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="text-foreground flex-1 text-sm leading-relaxed">{t('instruction4')}</span>
                    </li>
                  )}
                  {settings.copy_paste_protection && (
                    <li className="bg-card flex items-start gap-3 rounded-lg p-3 shadow-sm">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="text-foreground flex-1 text-sm leading-relaxed">{t('instruction5')}</span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Anti-Cheating Warnings with modern alert */}
              {(settings.tab_switch_detection || settings.copy_paste_protection || settings.devtools_detection) && (
                <Alert className="border-l-4 border-l-red-500 border-red-200 bg-red-50/80">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white">
                    <AlertCircle className="size-6" />
                  </div>
                  <div className="space-y-2">
                    <AlertTitle className="text-lg font-bold text-red-900">{t('antiCheatingEnabled')}</AlertTitle>
                    <AlertDescription className="text-red-800">
                      {t('antiCheatingDescription', {
                        threshold: settings.violation_threshold || t('notSet'),
                      })}
                    </AlertDescription>
                  </div>
                </Alert>
              )}

              <div className="mt-6 lg:hidden">
                {/* Mobile CTA: Start button stays inside main content on small screens */}
                {isTeacher && onBackToManage && (
                  <Button
                    size="lg"
                    onClick={onBackToManage}
                    variant="outline"
                  >
                    {t('backToManagement')}
                  </Button>
                )}

                {canTakeExam ? (
                  <div className="mt-3">
                    <Button
                      size="lg"
                      onClick={handleStartExam}
                      disabled={isStarting}
                      className="w-full"
                    >
                      {isStarting ? t('starting') : t('startExam')}
                    </Button>
                  </div>
                ) : (
                  <Alert className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{t('noAttemptsRemaining')}</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Previous Attempts (mobile-only) */}
              {userAttempts.length > 0 && (
                <div className="mt-6 space-y-2 lg:hidden">
                  <h3 className="text-lg font-semibold">{t('previousAttempts')}</h3>
                  <div className="space-y-2">
                    {userAttempts.map((attempt, index) => (
                      <div
                        key={attempt.id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{t('attemptNumber', { number: index + 1 })}</p>
                          <p className="text-sm text-gray-600">{new Date(attempt.submitted_at).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {attempt.score}/{attempt.max_score}
                            </p>
                            <p className="text-sm text-gray-600">
                              {attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0}%
                            </p>
                          </div>
                          {onReviewAttempt && exam.settings?.allow_result_review && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onReviewAttempt(attempt)}
                            >
                              {t('review')}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="sticky top-6 hidden lg:block">
          <Card>
            <CardHeader>
              <CardTitle>{t('readyToStart')}</CardTitle>
              <CardDescription>{t('readyToStartSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">{t('timeLimit')}</p>
                  <p className="text-lg font-semibold text-orange-600">
                    {timeLimit ? t('minutes', { count: timeLimit }) : t('unlimited')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-sm">{t('questions')}</p>
                  <p className="text-lg font-semibold text-blue-600">{questionCount}</p>
                </div>
              </div>

              <div>
                {canTakeExam ? (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleStartExam}
                    disabled={isStarting}
                  >
                    {isStarting ? t('starting') : t('startExam')}
                  </Button>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{t('noAttemptsRemaining')}</AlertDescription>
                  </Alert>
                )}

                {isTeacher && onBackToManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={onBackToManage}
                  >
                    {t('backToManagement')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Previous Attempts (desktop) */}
          {userAttempts.length > 0 && (
            <Card className="mt-4 hidden lg:block">
              <CardHeader>
                <CardTitle className="pb-4">{t('previousAttempts')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {userAttempts.map((attempt, index) => (
                  <div
                    key={attempt.id}
                    className="flex flex-col gap-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{t('attemptNumber', { number: userAttempts.length - index })}</p>
                        <p className="text-sm text-gray-600">{new Date(attempt.submitted_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {attempt.score}/{attempt.max_score}
                        </p>
                        <p className="text-sm text-gray-600">
                          {attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0}%
                        </p>
                      </div>
                    </div>
                    {onReviewAttempt && exam.settings?.allow_result_review && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onReviewAttempt(attempt)}
                        className="w-full"
                      >
                        {t('review')}
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
