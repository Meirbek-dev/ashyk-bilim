/**
 * Shared constants used across E2E test specs.
 * All secrets are read from environment variables — never hardcoded here.
 *
 * Environment is loaded by global-setup.ts before any test runs.
 * Test files that import this module directly (e.g. during spec collection)
 * will read from process.env which has already been populated.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEnvOr } from '../env'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const USERS = {
  admin: {
    email: getEnvOr('E2E_ADMIN_EMAIL', 'admin@test.local'),
    password: getEnvOr('E2E_ADMIN_PASSWORD', 'Admin1234!'),
  },
  teacher: {
    email: getEnvOr('E2E_TEACHER_EMAIL', 'teacher@test.local'),
    password: getEnvOr('E2E_TEACHER_PASSWORD', 'Teacher1234!'),
    firstName: getEnvOr('E2E_TEACHER_FIRST_NAME', 'Eve'),
    lastName: getEnvOr('E2E_TEACHER_LAST_NAME', 'Teach'),
  },
  student: {
    email: getEnvOr('E2E_STUDENT_EMAIL', 'student@test.local'),
    password: getEnvOr('E2E_STUDENT_PASSWORD', 'Student1234!'),
    firstName: getEnvOr('E2E_STUDENT_FIRST_NAME', 'Sam'),
    lastName: getEnvOr('E2E_STUDENT_LAST_NAME', 'Learn'),
  },
} as const

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
} as const

/** Sample file paths for upload tests (created in test setup) */
export const FIXTURES_DIR = path.join(__dirname, '../fixtures/files')
export const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample.pdf')

/**
 * The code challenge authored in spec 03 and solved in spec 04: the arena
 * grades stdin → stdout, so the solution reads «a b» and prints the sum. One
 * line on purpose — Monaco's auto-indent would reshape typed multi-line code.
 */
export const CORRECT_PYTHON_SOLUTION = 'print(sum(map(int, input().split())))'

export const CODE_CHALLENGE = {
  title: COURSE.activities.codeChallenge,
  prompt: 'Read two integers a and b from one line and print their sum.',
  /** Judge0 language button in the studio's Languages tab */
  language: /^Python \(3/,
  starterCode: '# read a and b, print a + b',
  referenceSolution: CORRECT_PYTHON_SOLUTION,
  tests: [
    { input: '2 3', expectedOutput: '5', visible: true },
    { input: '10 -4', expectedOutput: '6', visible: false },
  ],
} as const

/** Passing exam: the correct answers (v2 shuffles questions and options, so answer by text) */
export const EXAM_ANSWERS = {
  singleChoice: { question: 'What does HTML stand for?', answer: 'HyperText Markup Language' },
  trueFalse: { question: 'JavaScript is a statically typed language.', answer: 'False' },
  multiSelect: { question: 'Which of the following are JavaScript frameworks?', answers: ['React', 'Vue'] },
}
