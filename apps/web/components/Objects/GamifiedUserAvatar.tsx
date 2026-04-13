'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { useSession } from '@/hooks/useSession';
import { useUserByUsername } from '@/lib/users/client';
import { getBackendUrl, getAbsoluteUrl } from '@services/config/config';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import type { UserGamificationProfile } from '@/types/gamification';
import { AVATAR_UNLOCKS } from '@/lib/gamification/levels';
import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

import UserProfilePopup from './UserProfilePopup';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type AvatarVariant = 'default' | 'outline' | 'ghost';

interface GamifiedUserAvatarProps {
  size?: AvatarSize;
  variant?: AvatarVariant;
  avatar_url?: string;
  use_with_session?: boolean;
  predefined_avatar?: 'empty';
  showProfilePopup?: boolean;
  userId?: number;
  username?: string;
  className?: string;
  fallbackText?: string;

  // Gamification props
  showLevelIndicator?: boolean;
  showLevelBadge?: boolean;
  gamificationProfile?: UserGamificationProfile | null;
  levelIndicatorPosition?: 'top-right' | 'bottom-right' | 'bottom-center';
  showAvatarFrame?: boolean;
  showAvatarAccessories?: boolean;
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

const levelIndicatorSizes = {
  'xs': 'h-2 w-2 text-[8px]',
  'sm': 'h-3 w-3 text-[10px]',
  'md': 'h-4 w-4 text-xs',
  'lg': 'h-5 w-5 text-sm',
  'xl': 'h-6 w-6 text-sm',
  '2xl': 'h-6 w-6 text-base',
  '3xl': 'h-9 w-9 text-lg',
};

// FEATURE FLAG: Avatar customization (frames/accessories)
// TODO: Enable when backend supports equipped_frame_id and equipped_accessories
// See: docs/gamification/AVATAR_CUSTOMIZATION.md
const ENABLE_AVATAR_CUSTOMIZATION = false;

const isExternalUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://');

const extractExternalUrl = (url: string): string | null => {
  const matches = /avatars\/(https?:\/\/[^/]+.*$)/.exec(url);
  return matches?.[1] ?? null;
};

const GamifiedUserAvatar = (props: GamifiedUserAvatarProps) => {
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
    showLevelIndicator = false,
    showLevelBadge = false,
    gamificationProfile,
    levelIndicatorPosition = 'bottom-right',
    showAvatarFrame: _showAvatarFrame = false,
    showAvatarAccessories: _showAvatarAccessories = false,
  } = props;

  const showAvatarFrame = ENABLE_AVATAR_CUSTOMIZATION && _showAvatarFrame;
  const showAvatarAccessories = ENABLE_AVATAR_CUSTOMIZATION && _showAvatarAccessories;

  // Shared query caching deduplicates identical username lookups across components.
  const { data: userData } = useUserByUsername(username);

  const getAvatarUrl = (): string => {
    if (predefined_avatar) return getAbsoluteUrl('/empty_avatar.webp');

    if (avatar_url) {
      const extracted = extractExternalUrl(avatar_url);
      if (extracted) return extracted;
      if (isExternalUrl(avatar_url)) return avatar_url;
      if (avatar_url.startsWith('content/')) return `${getBackendUrl()}${avatar_url}`;
      return avatar_url;
    }

    if (userData?.avatar_image) {
      const url = userData.avatar_image;
      return isExternalUrl(url) ? url : getUserAvatarMediaDirectory(userData.user_uuid, url);
    }

    // Username given but no data yet — show empty rather than falling through to session user.
    if (username) return getAbsoluteUrl('/empty_avatar.webp');

    // No username — show the current session user's avatar.
    if (currentUser?.avatar_image) {
      const url = currentUser.avatar_image;
      return isExternalUrl(url) ? url : getUserAvatarMediaDirectory(currentUser.user_uuid, url);
    }

    return getAbsoluteUrl('/empty_avatar.webp');
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

  const getAvatarFrame = (): string | null => {
    if (!(showAvatarFrame && gamificationProfile)) return null;
    const { level } = gamificationProfile;
    const availableFrames = AVATAR_UNLOCKS.frames.filter((frame) => level >= frame.level);
    const highestFrame = availableFrames[availableFrames.length - 1];
    return highestFrame ? highestFrame.color : null;
  };

  const getAvatarAccessory = (): string | null => {
    if (!(showAvatarAccessories && gamificationProfile)) return null;
    const { level } = gamificationProfile;
    const availableAccessories = AVATAR_UNLOCKS.accessories.filter((a) => level >= a.level);
    const highestAccessory = availableAccessories[availableAccessories.length - 1];
    return highestAccessory ? highestAccessory.icon : null;
  };

  const frameClass = getAvatarFrame();
  const accessoryIcon = getAvatarAccessory();
  const popupUserId = userId ?? userData?.id ?? null;

  const avatarElement = (
    <div className="relative inline-block">
      <Avatar
        className={cn(
          sizeVariants[size],
          variantStyles[variant],
          'bg-background',
          frameClass && `border-4 ${frameClass}`,
          className,
        )}
      >
        <AvatarImage
          src={getAvatarUrl()}
          alt={t('altText')}
          className="bg-background"
        />
        <AvatarFallback className="bg-muted text-muted-foreground">
          {predefined_avatar === 'empty' ? <User className="h-[60%] w-[60%]" /> : getFallbackText()}
        </AvatarFallback>
      </Avatar>

      {accessoryIcon && <div className="absolute -top-1 -right-1 text-sm">{accessoryIcon}</div>}

      {showLevelBadge && gamificationProfile && (
        <div
          className={cn(
            'absolute z-10 flex items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-md ring-2 ring-background',
            levelIndicatorSizes[size],
            {
              '-top-1 -right-1': levelIndicatorPosition === 'top-right',
              '-bottom-1 -right-1': levelIndicatorPosition === 'bottom-right',
              '-bottom-1 -translate-x-1/2 left-1/2': levelIndicatorPosition === 'bottom-center',
            },
          )}
        >
          {gamificationProfile.level}
        </div>
      )}

      {showLevelIndicator && gamificationProfile && (
        <div
          className={cn(
            'absolute z-10 flex items-center justify-center rounded-full shadow-md ring-2 ring-background',
            levelIndicatorSizes[size],
            {
              '-top-1 -right-1': levelIndicatorPosition === 'top-right',
              '-bottom-2 -right-2': levelIndicatorPosition === 'bottom-right',
              '-bottom-1 -translate-x-1/2 left-1/2': levelIndicatorPosition === 'bottom-center',
            },
          )}
        />
      )}
    </div>
  );

  if (showProfilePopup && popupUserId) {
    return <UserProfilePopup userId={popupUserId}>{avatarElement}</UserProfilePopup>;
  }

  return avatarElement;
};

export default GamifiedUserAvatar;
