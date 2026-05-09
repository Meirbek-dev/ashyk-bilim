'use client';
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Globe,
  GraduationCap,
  Laptop2,
  Lightbulb,
  Link,
  Loader2,
  MapPin,
  Users,
} from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useUserById } from '@/lib/users/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactNode } from 'react';

interface UserProfilePopupProps {
  children: ReactNode;
  userId: number;
}

interface UserData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  bio?: string;
  avatar_image?: string;
  details?: Record<
    string,
    {
      id: string;
      label: string;
      icon: string;
      text: string;
    }
  >;
}

type UserDetail = NonNullable<UserData['details']>[string];

const ICON_MAP = {
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  'speciality': Lightbulb,
  'globe': Globe,
  'link': Link,
  'users': Users,
  'calendar': Calendar,
  'laptop-2': Laptop2,
  'award': Award,
  'book-open': BookOpen,
} as const;

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = ICON_MAP[iconName as keyof typeof ICON_MAP];
  if (!IconElement) return null;
  return <IconElement className="text-muted-foreground h-4 w-4" />;
};

const UserProfilePopup = ({ children, userId }: UserProfilePopupProps) => {
  const t = useTranslations('Components.UserProfilePopup');
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const [open, setOpen] = useState(false);
  const { data: userData, error, isLoading } = useUserById(userId, { enabled: open && isAuthenticated });
  const details = userData?.details ? (Object.values(userData.details) as UserDetail[]) : [];

  return (
    <HoverCard onOpenChange={setOpen}>
      <HoverCardTrigger render={<span />}>{children}</HoverCardTrigger>
      <HoverCardContent className="soft-shadow border-border bg-card text-card-foreground w-auto max-w-196 min-w-96 border p-0 shadow-sm backdrop-blur-md">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-destructive p-4 text-sm">{t('loadingError')}</div>
        ) : userData ? (
          <div>
            {/* Header with Avatar and Name */}
            <div className="relative">
              {/* Background gradient */}
              <div className="from-muted/60 absolute inset-0 h-28 rounded-t-lg bg-linear-to-b to-transparent" />

              {/* Content */}
              <div className="relative px-5 pt-5 pb-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="shrink-0">
                    <div className="rounded-full">{children}</div>
                  </div>

                  {/* Name, Bio, and Button */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h4 className="text-foreground truncate font-semibold">
                          {[userData.first_name, userData.middle_name, userData.last_name].filter(Boolean).join(' ')}
                        </h4>
                        {userData.username ? (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground truncate px-2 text-xs font-normal"
                          >
                            @{userData.username}
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0"
                        onClick={() => userData.username && router.push(`/user/${userData.username}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    {userData.bio ? (
                      <p className="text-muted-foreground mt-1.5 line-clamp-4 text-sm leading-normal">{userData.bio}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Details */}
            {details.length > 0 ? (
              <div className="border-border space-y-2.5 border-t px-5 pt-3.5 pb-4">
                {details.map((detail) => (
                  <div
                    key={detail.id}
                    className="flex items-center gap-2.5"
                  >
                    <IconComponent iconName={detail.icon} />
                    <div className="flex flex-col">
                      <span className="text-muted-foreground text-xs">{detail.label}</span>
                      <span className="text-foreground text-sm">{detail.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
};

export default UserProfilePopup;
