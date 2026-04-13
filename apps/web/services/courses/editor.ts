import { getResponseMetadata } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';

export interface CourseEditorResource<T> {
  data: T | null;
  status: number;
  error: string | null;
  available: boolean;
}

export interface CourseEditorBundle {
  contributors: CourseEditorResource<any[]>;
  linkedUserGroups: CourseEditorResource<any[]>;
  certifications: CourseEditorResource<any[]>;
}

const createResource = <T>(
  data: T | null,
  status = 0,
  error: string | null = null,
  available = true,
): CourseEditorResource<T> => ({
  data,
  status,
  error,
  available,
});

export const createEmptyCourseEditorBundle = (): CourseEditorBundle => ({
  contributors: createResource<any[]>(null, 0, null, false),
  linkedUserGroups: createResource<any[]>(null, 0, null, false),
  certifications: createResource<any[]>(null, 0, null, false),
});

const toArrayResource = (response: {
  success: boolean;
  data: any;
  status: number;
  HTTPmessage: string;
}): CourseEditorResource<any[]> => {
  if (response.status === 401 || response.status === 403) {
    return createResource<any[]>(null, response.status, null, false);
  }

  if (!response.success) {
    const detail =
      typeof response.data?.detail === 'string' ? response.data.detail : response.HTTPmessage || 'Request failed';
    return createResource<any[]>([], response.status, detail, true);
  }

  return createResource(Array.isArray(response.data) ? response.data : [], response.status, null, true);
};

export async function getCourseEditorBundle(courseUuid: string): Promise<CourseEditorBundle> {
  const [contributors, linkedUserGroups, certifications] = await Promise.all([
    apiFetch(`courses/${courseUuid}/contributors`).then(getResponseMetadata),
    apiFetch(`usergroups/resource/${courseUuid}`).then(getResponseMetadata),
    apiFetch(`certifications/course/${courseUuid}`).then(getResponseMetadata),
  ]);

  return {
    contributors: toArrayResource(contributors),
    linkedUserGroups: toArrayResource(linkedUserGroups),
    certifications: toArrayResource(certifications),
  };
}
