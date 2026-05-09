interface ActivityLike {
  id?: number | null;
  activity_uuid?: string | null;
}

interface ChapterLike<TActivity extends ActivityLike> {
  name?: string;
  activities?: TActivity[] | null;
}

export type IndexedCourseActivity<TActivity extends ActivityLike = ActivityLike> = TActivity & {
  cleanUuid: string;
  chapterName?: string;
  chapterIndex: number;
  activityIndex: number;
};

export function normalizeActivityUuid(activityUuid?: string | null): string {
  return activityUuid?.replace(/^activity_/, '') ?? '';
}

export function buildCourseActivityIndex<TActivity extends ActivityLike>(
  chapters: (ChapterLike<TActivity> | null | undefined)[] | null | undefined,
) {
  const allActivities: IndexedCourseActivity<TActivity>[] = [];
  const indexByActivityId = new Map<number, number>();
  const indexByCleanUuid = new Map<string, number>();

  (chapters ?? []).forEach((chapter, chapterIndex) => {
    (chapter?.activities ?? []).forEach((activity, activityIndex) => {
      const cleanUuid = normalizeActivityUuid(activity.activity_uuid);
      const nextIndex = allActivities.length;
      const indexedActivity = {
        ...activity,
        cleanUuid,
        chapterName: chapter?.name,
        chapterIndex,
        activityIndex,
      } as IndexedCourseActivity<TActivity>;

      allActivities.push(indexedActivity);

      if (typeof activity.id === 'number') {
        indexByActivityId.set(activity.id, nextIndex);
      }

      if (cleanUuid) {
        indexByCleanUuid.set(cleanUuid, nextIndex);
      }
    });
  });

  return {
    allActivities,
    indexByActivityId,
    indexByCleanUuid,
  };
}
