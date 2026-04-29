export function isAssignmentsV2Enabled() {
  return ['1', 'true', 'yes', 'on'].includes((process.env.NEXT_PUBLIC_ASSIGNMENTS_V2 ?? '').toLowerCase());
}
