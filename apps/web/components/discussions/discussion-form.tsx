'use client';

import UserAvatar from '@components/Objects/UserAvatar';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { hasMeaningfulText } from './text';

const RichTextEditor = dynamic(
  () => import('@components/Objects/Editor/views/DiscussionEditor').then((m) => ({ default: m.DiscussionEditor })),
  {
    ssr: false,
    loading: () => <div className="bg-muted/40 h-[120px] w-full animate-pulse rounded-lg border" />,
  },
);

interface DiscussionFormProps {
  currentUser: any;
  onSubmit: (content: string) => void;
}

export default function DiscussionForm({ currentUser, onSubmit }: DiscussionFormProps) {
  const t = useTranslations('CoursePage');
  const [content, setContent] = useState('');

  const handleSubmit = (formData: FormData) => {
    const nextContent = String(formData.get('content') ?? '');

    if (!hasMeaningfulText(nextContent)) return;
    onSubmit(nextContent);
    setContent('');
  };

  const isContentEmpty = !hasMeaningfulText(content);

  return (
    <div className="bg-card text-card-foreground rounded-lg border p-5 shadow-sm">
      <form
        action={handleSubmit}
        className="space-y-4"
      >
        <input
          type="hidden"
          name="content"
          value={content}
        />
        <div className="flex items-start gap-4">
          <UserAvatar
            size="md"
            variant="default"
            username={currentUser?.username}
          />
          <div className="flex-1">
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder={t('startDiscussionPlaceholder')}
              minHeight="120px"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isContentEmpty}
            className="flex items-center gap-2"
          >
            <Send size={16} />
            <span>{t('postDiscussion')}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
