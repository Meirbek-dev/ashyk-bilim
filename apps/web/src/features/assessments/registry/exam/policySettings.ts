type ExamSettingsRecord = Record<string, unknown>

export interface ExamPolicyPatch {
  max_attempts: number | null
  time_limit_seconds: number | null
  copy_paste_protection: boolean
  tab_switch_detection: boolean
  devtools_detection: boolean
  right_click_disabled: boolean
  fullscreen_required: boolean
  violation_threshold: number | null
}

function readInt(settings: ExamSettingsRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = settings[key]
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value
    }
  }
  return null
}

export function getExamAttemptLimit(settings: ExamSettingsRecord): number | null {
  return readInt(settings, 'max_attempts', 'attempt_limit')
}

export function getExamTimeLimitSeconds(settings: ExamSettingsRecord): number | null {
  const seconds = readInt(settings, 'time_limit_seconds')
  if (seconds !== null) return seconds
  const minutes = readInt(settings, 'time_limit')
  if (minutes !== null) return minutes * 60
  return null
}

export function buildExamPolicyPatch(settings: ExamSettingsRecord): ExamPolicyPatch {
  return {
    max_attempts: getExamAttemptLimit(settings) ?? 1,
    time_limit_seconds: getExamTimeLimitSeconds(settings),
    copy_paste_protection: settings.copy_paste_protection === true,
    tab_switch_detection: settings.tab_switch_detection === true,
    devtools_detection: settings.devtools_detection === true,
    right_click_disabled: settings.right_click_disable === true || settings.right_click_disabled === true,
    fullscreen_required: settings.fullscreen_enforcement === true || settings.fullscreen_required === true,
    violation_threshold:
      typeof settings.violation_threshold === 'number' && Number.isInteger(settings.violation_threshold)
        ? settings.violation_threshold
        : null,
  }
}
