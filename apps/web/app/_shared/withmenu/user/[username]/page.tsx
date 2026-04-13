import { getUserByUsername } from '@/lib/users/server';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import UserProfileClient from './UserProfileClient';

interface UserPageParams {
  username: string;
}

interface UserPageProps {
  params: Promise<UserPageParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const t = await getTranslations('UserProfilePage');

  try {
    const resolvedParams = await params;
    const userData = await getUserByUsername(resolvedParams.username);

    return {
      title: t('metaTitle', {
        firstName: userData.first_name,
        lastName: userData.last_name,
      }),
      description:
        userData.bio ||
        t('metaDescriptionFallback', {
          firstName: userData.first_name,
          lastName: userData.last_name,
        }),
    };
  } catch {
    return {
      title: t('metaTitleError'),
    };
  }
}

async function UserPage({ params }: UserPageProps) {
  const t = await getTranslations('UserProfilePage');
  const resolvedParams = await params;
  const { username } = resolvedParams;

  let userData;
  let profile;
  let hasError = false;

  try {
    userData = await getUserByUsername(username);
    profile = userData.profile
      ? typeof userData.profile === 'string'
        ? JSON.parse(userData.profile)
        : userData.profile
      : { sections: [] };
  } catch (error) {
    console.error('Error fetching user data:', error);
    hasError = true;
  }

  if (hasError) {
    return (
      <div className="container mx-auto py-8">
        <div className="soft-shadow bg-card rounded-xl p-6">
          <p className="text-red-600">{t('profileLoadError')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <UserProfileClient
        userData={userData}
        profile={profile}
      />
    </div>
  );
}

export default UserPage;
