export type AIRole = 'student' | 'teacher' | 'author' | 'admin'

export function canSeeTeacherEvidence(role: AIRole) {
  return role === 'teacher' || role === 'author' || role === 'admin'
}

export function canApproveAIAction(role: AIRole) {
  return role === 'teacher' || role === 'author' || role === 'admin'
}

export function studentSafeVisibility(role: AIRole) {
  return role === 'student'
    ? 'Published course material only'
    : 'Course drafts, rubrics, and teacher evidence when permitted'
}
