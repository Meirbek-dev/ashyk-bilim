/**
 * AssessmentKindRegistry
 *
 * Maps each assessable activity type to three surface modules:
 *   - Author  — the content panel for the Studio surface
 *   - Attempt — the content panel for the Student Attempt surface
 *   - Review  — the kind-aware detail panel for Submission Review
 *
 * Phase 1 rule: every slot wraps the existing component as a passthrough.
 * Phase 2+ will progressively replace passthroughs with shared shells.
 *
 * Usage:
 *   const { Author, Attempt, Review } = getKindModule('TYPE_ASSIGNMENT');
 */

import type { ComponentType, ReactNode } from 'react';
import type { AssessmentKind, AttemptViewModel } from '../domain';
import type { Submission } from '@/features/grading/domain/types';

export interface KindAuthorProps {
  activityUuid: string;
  courseUuid: string;
}

export interface KindAttemptProps {
  activityUuid: string;
  courseUuid: string;
  vm?: AttemptViewModel;
}

export interface KindReviewProps {
  activityId: number;
  submissionUuid?: string | null;
  title?: string;
}

/**
 * Props for the kind-specific center-pane "submitted work" panel shown inside
 * GradingReviewWorkspace. When a kind registers a ReviewDetail component it
 * replaces the generic SubmittedAnswers fallback.
 */
export interface KindReviewDetailProps {
  /** The selected submission being reviewed. */
  submission: Submission;
  /** Activity UUID — required by some kinds (e.g. exam) to load question data. */
  activityUuid?: string;
}

export interface KindModule {
  /** Label shown in the topbar and breadcrumbs. */
  label: string;
  /** Icon import key — maps to Lucide icon name. */
  iconName: string;
  /**
   * Optional context provider that wraps Outline + Author + Inspector together.
   * Use when the three slots need shared state (e.g. selected task in assignments).
   * AssessmentStudioWorkspace renders this as the outermost wrapper.
   */
  Provider?: ComponentType<KindAuthorProps & { children: ReactNode }>;
  /**
   * Optional left rail rendered in column 1 of the studio 3-column grid.
   * Examples: task outline (assignment), question list (exam).
   */
  Outline?: ComponentType<KindAuthorProps>;
  /** Teacher authoring panel — center column of the studio grid. */
  Author: ComponentType<KindAuthorProps>;
  /**
   * Optional right rail rendered in column 3 of the studio 3-column grid.
   * Examples: policy inspector (assignment), exam settings summary.
   */
  Inspector?: ComponentType<KindAuthorProps>;
  /** Student attempt panel. */
  Attempt: ComponentType<KindAttemptProps>;
  /** Submission detail panel for the review surface. */
  Review: ComponentType<KindReviewProps>;
  /**
   * Optional kind-specific "submitted work" panel for GradingReviewWorkspace's
   * center pane. When provided, replaces the generic SubmittedAnswers fallback.
   * Phase 2+: exam provides question-level answer rendering here.
   */
  ReviewDetail?: ComponentType<KindReviewDetailProps>;
}

function getRegistry(): Map<AssessmentKind, () => Promise<KindModule>> {
  const f = getRegistry as any;
  if (!f._map) f._map = new Map();
  return f._map;
}

/** Register a kind module factory. Call once per kind (e.g., in kind's own file). */
export function registerKind(kind: AssessmentKind, factory: () => Promise<KindModule>): void {
  getRegistry().set(kind, factory);
}

/** Resolve a kind module. Throws if the kind is not registered. */
export async function resolveKindModule(kind: AssessmentKind): Promise<KindModule> {
  const factory = getRegistry().get(kind);
  if (!factory) {
    throw new Error(`AssessmentKindRegistry: no module registered for kind "${kind}"`);
  }
  return factory();
}

/**
 * Synchronous access for contexts where async loading is managed externally.
 * Returns undefined if the kind module has not been loaded yet.
 */
function getLoadedModules(): Map<AssessmentKind, KindModule> {
  const f = getLoadedModules as any;
  if (!f._map) f._map = new Map();
  return f._map;
}

export function getLoadedKindModule(kind: AssessmentKind): KindModule | undefined {
  return getLoadedModules().get(kind);
}

export async function loadKindModule(kind: AssessmentKind): Promise<KindModule> {
  const existing = getLoadedModules().get(kind);
  if (existing) return existing;
  const module_ = await resolveKindModule(kind);
  getLoadedModules().set(kind, module_);
  return module_;
}

// Register all built-in kinds eagerly so they are ready at import time.
// Each kind file self-registers via a side-effect import.
import './assignment';
import './exam';
import './code-challenge';
import './quiz';
