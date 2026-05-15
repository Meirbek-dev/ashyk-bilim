/**
 * Storage state file paths for authenticated browser sessions.
 * Defined separately from global-setup to avoid import cycles in test files.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STORAGE_STATE_DIR = path.join(__dirname, '.auth');

export const STORAGE_STATE = {
  admin: path.join(STORAGE_STATE_DIR, 'admin.json'),
  teacher: path.join(STORAGE_STATE_DIR, 'teacher.json'),
  student: path.join(STORAGE_STATE_DIR, 'student.json'),
} as const;
