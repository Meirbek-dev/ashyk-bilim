'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { useSession } from '@/hooks/useSession';
import { useUserByUsername } from '@/lib/users/client';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { getAbsoluteUrl } from '@services/config/config';
import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

import UserProfilePopup from './UserProfilePopup';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type AvatarVariant = 'default' | 'outline' | 'ghost';

interface UserAvatarProps {
  size?: AvatarSize;
  variant?: AvatarVariant;
  avatar_url?: string;
  use_with_session?: boolean;
  predefined_avatar?: 'ai' | 'empty';
  showProfilePopup?: boolean;
  userId?: number;
  username?: string;
  className?: string;
  fallbackText?: string;
}

const sizeVariants = {
  'xs': 'h-6 w-6 text-[10px]',
  'sm': 'h-8 w-8 text-xs',
  'md': 'h-10 w-10 text-sm',
  'lg': 'h-12 w-12 text-base',
  'xl': 'h-16 w-16 text-lg',
  '2xl': 'h-20 w-20 text-xl',
  '3xl': 'h-32 w-32 text-2xl',
};

const variantStyles = {
  default: 'border-2 border-background shadow-md',
  outline: 'border-2 border-border',
  ghost: 'border-0',
};

const isExternalUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://');

const extractExternalUrl = (url: string): string | null => {
  const matches = /avatars\/(https?:\/\/[^/]+.*$)/.exec(url);
  return matches?.[1] ?? null;
};

const UserAvatar = (props: UserAvatarProps) => {
  const t = useTranslations('Components.UserAvatar');
  const { user: currentUser } = useSession();

  const {
    size = 'md',
    variant = 'default',
    avatar_url,
    predefined_avatar,
    showProfilePopup,
    userId,
    username,
    className,
    fallbackText,
  } = props;

  // Shared query caching deduplicates identical username lookups across components.
  const { data: userData } = useUserByUsername(username);

  const getAvatarUrl = (): string => {
    if (predefined_avatar) {
      const avatarType = predefined_avatar === 'ai' ? 'platform_logo_light.svg' : 'empty_avatar.avif';
      return getAbsoluteUrl(`/${avatarType}`);
    }

    if (avatar_url) {
      return extractExternalUrl(avatar_url) ?? (isExternalUrl(avatar_url) ? avatar_url : avatar_url);
    }

    if (userData?.avatar_image) {
      const url = userData.avatar_image;
      return isExternalUrl(url) ? url : getUserAvatarMediaDirectory(userData.user_uuid, url);
    }

    // Username given but no data yet — show empty rather than falling through to session user.
    if (username) return getAbsoluteUrl('/empty_avatar.avif');

    // No username — show the current session user's avatar.
    if (currentUser?.avatar_image) {
      const url = currentUser.avatar_image;
      return isExternalUrl(url) ? url : getUserAvatarMediaDirectory(currentUser.user_uuid, url);
    }

    return getAbsoluteUrl('/empty_avatar.avif');
  };

  const getFallbackText = (): string => {
    if (fallbackText) return fallbackText;

    if (userData?.first_name && userData?.last_name) {
      return `${userData.first_name[0]}${userData.last_name[0]}`.toUpperCase();
    }

    if (username) return username.charAt(0).toUpperCase();

    if (currentUser?.first_name && currentUser?.last_name) {
      return `${currentUser.first_name[0]}${currentUser.last_name[0]}`.toUpperCase();
    }

    return userData?.username?.[0]?.toUpperCase() ?? currentUser?.username?.[0]?.toUpperCase() ?? '?';
  };

  const avatarElement = (
    <Avatar className={cn(sizeVariants[size], variantStyles[variant], 'bg-background', className)}>
      <AvatarImage
        src={getAvatarUrl()}
        alt={t('altText')}
        className="bg-background"
      />
      <AvatarFallback className="bg-muted text-muted-foreground">
        {predefined_avatar === 'ai' ? <User className="h-[60%] w-[60%]" /> : getFallbackText()}
      </AvatarFallback>
    </Avatar>
  );

  const popupUserId = userId ?? userData?.id ?? null;

  if (showProfilePopup && popupUserId) {
    return <UserProfilePopup userId={popupUserId}>{avatarElement}</UserProfilePopup>;
  }

  return avatarElement;
};

export default UserAvatar;
