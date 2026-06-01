// ---------------------------------------------------------------------------
// Course Create — Shared Types
// ---------------------------------------------------------------------------

export type CourseStructureMode = 'blank' | 'starter' | 'copy-outline'

export type CourseInitialVisibility = 'private' | 'public'

export type CourseCreateDestination = 'overview' | 'curriculum'

/** Values managed by the create form. */
export interface CourseCreateFormValues {
  title: string
  description: string
  structureMode: CourseStructureMode
  sourceCourseUuid: string
  initialVisibility: CourseInitialVisibility
  destination: CourseCreateDestination
}

/** Payload sent to the orchestration function. */
export interface CourseCreatePayload {
  title: string
  description: string
  structureMode: CourseStructureMode
  sourceCourseUuid?: string
  initialVisibility: CourseInitialVisibility
}

/** A successful creation result. */
export interface CourseCreateSuccess {
  status: 'success'
  courseUuid: string
  importedChapterCount: number
  destinationPath: string
}

/** A partial-success result — course created but some chapters failed. */
export interface CourseCreatePartialSuccess {
  status: 'partial'
  courseUuid: string
  importedChapterCount: number
  failedChapterCount: number
  destinationPath: string
}

/** A complete failure result. */
export interface CourseCreateFailure {
  status: 'error'
  message: string
}

export type CourseCreateResult = CourseCreateSuccess | CourseCreatePartialSuccess | CourseCreateFailure

/** A course option returned from source-course search. */
export interface SourceCourseOption {
  courseUuid: string
  name: string
}
