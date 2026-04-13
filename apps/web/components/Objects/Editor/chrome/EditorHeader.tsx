'use client';

import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import Link from '@components/ui/AppLink';
import Image from 'next/image';
import platformLogoDark from '@public/platform_logo.svg';
import platformLogoLight from '@public/platform_logo_light.svg';
import UserAvatar from '../../UserAvatar';
import { Separator } from '@/components/ui/separator';
import { EditorSaveIndicator } from './EditorSaveIndicator';

interface EditorHeaderProps {
  courseName: string;
  activityName: string;
  courseUuid: string;
  activityUuid: string;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onSave: () => void;
}

export function EditorHeader({
  courseName,
  activityName,
  courseUuid,
  activityUuid,
  saveState,
  onSave,
}: EditorHeaderProps) {
  const t = useTranslations('DashPage.Editor.Editor');

  return (
    <div className="border-border bg-background flex h-12 items-center justify-between border-b px-3">
      {/* Left: breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/">
          <Image
            className="hidden rounded-md dark:block"
            width={22}
            height={22}
            src={platformLogoDark}
            alt="Ashyq Bilim logo"
            style={{ height: 'auto' }}
          />
          <Image
            className="rounded-md dark:hidden"
            width={22}
            height={22}
            src={platformLogoLight}
            alt="Ashyq Bilim logo"
            style={{ height: 'auto' }}
          />
        </Link>
        <Separator
          orientation="vertical"
          className="h-4"
        />
        <nav className="flex min-w-0 items-center gap-1 truncate text-sm">
          <Link
            target="_blank"
            href={`/course/${courseUuid}`}
            className="text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            {courseName}
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-foreground truncate font-medium">{activityName}</span>
        </nav>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <EditorSaveIndicator saveState={saveState} />

        <button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          onClick={onSave}
        >
          {t('save')}
        </button>

        <Link
          target="_blank"
          href={`/course/${courseUuid}/activity/${activityUuid}`}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-8 items-center justify-center rounded-md transition-colors"
          title={t('preview')}
        >
          <Eye className="size-4" />
        </Link>

        <Separator
          orientation="vertical"
          className="mx-0.5 h-4"
        />

        <UserAvatar
          size="lg"
          variant="outline"
          use_with_session
        />
      </div>
    </div>
  );
}
