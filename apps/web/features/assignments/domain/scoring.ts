import type { AssignmentTaskRead } from './types';

export function getTaskMaxPoints(task: Pick<AssignmentTaskRead, 'max_grade_value'>): number {
  const points = task.max_grade_value;
  return Number.isFinite(points) && points > 0 ? points : 0;
}

export function getAssignmentTotalPoints(tasks: Pick<AssignmentTaskRead, 'max_grade_value'>[]): number {
  return tasks.reduce((total, task) => total + getTaskMaxPoints(task), 0);
}

export function pointsToPercent(points: number, totalPoints: number): number | null {
  if (!Number.isFinite(points) || !Number.isFinite(totalPoints) || totalPoints <= 0) return null;
  return Math.round((points / totalPoints) * 100 * 100) / 100;
}

export function percentToPoints(percent: number, totalPoints: number): number | null {
  if (!Number.isFinite(percent) || !Number.isFinite(totalPoints) || totalPoints <= 0) return null;
  return Math.round((percent / 100) * totalPoints * 100) / 100;
}
