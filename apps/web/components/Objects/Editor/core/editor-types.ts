/**
 * Minimal typed reference for an activity passed to editor extensions.
 * All extension options that previously used `activity: any` should use this.
 */
export interface ActivityRef {
  activity_uuid: string;
  name?: string;
}
