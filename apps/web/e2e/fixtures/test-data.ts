/**
 * Shared constants used across E2E test specs.
 * All secrets are read from environment variables — never hardcoded here.
 *
 * Environment is loaded by global-setup.ts before any test runs.
 * Test files that import this module directly (e.g. during spec collection)
 * will read from process.env which has already been populated.
 */

export const USERS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin1234!',
  },
  teacher: {
    email: process.env.E2E_TEACHER_EMAIL ?? 'teacher@test.local',
    password: process.env.E2E_TEACHER_PASSWORD ?? 'Teacher1234!',
    firstName: process.env.E2E_TEACHER_FIRST_NAME ?? 'Eve',
    lastName: process.env.E2E_TEACHER_LAST_NAME ?? 'Teach',
  },
  student: {
    email: process.env.E2E_STUDENT_EMAIL ?? 'student@test.local',
    password: process.env.E2E_STUDENT_PASSWORD ?? 'Student1234!',
    firstName: process.env.E2E_STUDENT_FIRST_NAME ?? 'Sam',
    lastName: process.env.E2E_STUDENT_LAST_NAME ?? 'Learn',
  },
} as const;

/** Course metadata used in the "ultimate course" fixture. */
export const COURSE = {
  title: 'E2E Ultimate Course',
  description: 'Comprehensive end-to-end test course covering all block and activity types.',
  /** Chapter names */
  chapters: {
    lectures: 'Lectures & Content',
    assessments: 'Assessments & Tasks',
  },
  /** Activity names */
  activities: {
    dynamicLecture: 'Introduction Lecture',
    fileSubmission: 'Project Upload Task',
    exam: 'Final Exam',
    codeChallenge: 'Coding Challenge',
  },
} as const;

/** Sample file paths for upload tests (created in test setup) */
export const FIXTURES_DIR = path.join(__dirname, '../fixtures/files');
export const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample.pdf');

/** A simple Python function used in the coding challenge test */
export const CORRECT_PYTHON_SOLUTION = `def add(a, b):\n    return a + b\n`;

/** Passing exam: answer indices that should yield a passing score */
export const EXAM_ANSWERS = {
  question0ChoiceIndex: 0, // First question, first choice (set as correct)
  question1IsTrue: true, // True/False — True
  question2MultiSelectIndices: [0, 2], // Multi-select: choices 0 and 2
};
