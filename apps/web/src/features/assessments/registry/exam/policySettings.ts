type ExamSettingsRecord = Record<string, unknown>;

function readInt(settings: ExamSettingsRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
  }
  return null;
}

function readString(settings: ExamSettingsRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function getExamAttemptLimit(settings: ExamSettingsRecord): number | null {
  return readInt(settings, 'max_attempts', 'attempt_limit');
}

export function getExamTimeLimitSeconds(settings: ExamSettingsRecord): number | null {
  const canonicalSeconds = readInt(settings, 'time_limit_seconds');
  if (canonicalSeconds !== null) {
    return canonicalSeconds;
  }

  const legacyMinutes = readInt(settings, 'time_limit');
  return legacyMinutes === null ? null : legacyMinutes * 60;
}

export function buildExamAntiCheatSettings(settings: ExamSettingsRecord) {
  return {
    copy_paste_protection: settings.copy_paste_protection === true,
    tab_switch_detection: settings.tab_switch_detection === true,
    devtools_detection: settings.devtools_detection === true,
    right_click_disable: settings.right_click_disable === true,
    fullscreen_enforcement: settings.fullscreen_enforcement === true,
    violation_threshold:
      typeof settings.violation_threshold === 'number' && Number.isInteger(settings.violation_threshold)
        ? settings.violation_threshold
        : null,
  };
}

export function normalizeExamPolicySettings(settings: ExamSettingsRecord | null | undefined): ExamSettingsRecord {
  const normalized: ExamSettingsRecord = { ...settings };
  const dueAt = readString(normalized, 'due_at', 'due_date_iso');
  const maxAttempts = getExamAttemptLimit(normalized);
  const timeLimitSeconds = getExamTimeLimitSeconds(normalized);

  normalized.due_at = dueAt;
  normalized.due_date_iso = dueAt;
  normalized.max_attempts = maxAttempts;
  normalized.attempt_limit = maxAttempts;
  normalized.time_limit_seconds = timeLimitSeconds;
  normalized.time_limit = timeLimitSeconds === null ? null : Math.max(1, Math.ceil(timeLimitSeconds / 60));

  return normalized;
}
