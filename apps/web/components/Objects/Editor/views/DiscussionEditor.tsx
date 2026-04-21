'use client';

import {
  Bold,
  Code,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Undo,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SiYoutube } from '@icons-pack/react-simple-icons';
import { useEffect, useState, useTransition } from 'react';
import { EditorContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useEditorInstance } from '@components/Objects/Editor/core';
import '@components/Objects/Editor/styles/prosemirror.css';

interface DiscussionEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function DiscussionEditor({
  content,
  onChange,
  placeholder = '',
  className = '',
  minHeight = '150px',
}: DiscussionEditorProps) {
  const t = useTranslations('RichTextEditor');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditorInstance({
    preset: 'discussion',
    content,
    onUpdate: (json) => onChange(JSON.stringify(json)),
    overrides: {
      editorProps: {
        attributes: {
          class: cn('prosemirror-discussion', className),
          style: `min-height: ${minHeight}`,
        },
      },
    },
  });

  const [isPending, startTransition] = useTransition();

  // Sync content prop changes with editor
  useEffect(() => {
    if (!editor) return;
    const currentJson = JSON.stringify(editor.getJSON());
    if (currentJson !== content) {
      let parsedContent: string | object = content;
      try {
        const parsed = JSON.parse(content) as unknown;
        if (parsed && typeof parsed === 'object') parsedContent = parsed;
      } catch {
        // treat as HTML string
      }
      editor.commands.setContent(parsedContent);
    }
  }, [editor, content]);

  const addLink = () => {
    if (!(editor && linkUrl)) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (selectedText) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: linkUrl,
          marks: [{ type: 'link', attrs: { href: linkUrl, target: '_blank', rel: 'noopener noreferrer' } }],
        })
        .run();
    }

    setLinkUrl('');
    setIsLinkDialogOpen(false);
  };

  const addImage = () => {
    if (!(editor && imageUrl)) return;
    editor.chain().focus().setImage({ src: imageUrl, alt: 'Uploaded image' }).run();
    setImageUrl('');
    setIsImageDialogOpen(false);
  };

  const addVideo = () => {
    if (!(editor && videoUrl)) return;

    const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/;
    const match = youtubeRegex.exec(videoUrl);

    if (match) {
      editor.chain().focus().setYoutubeVideo({ src: videoUrl }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: videoUrl,
          marks: [{ type: 'link', attrs: { href: videoUrl, target: '_blank', rel: 'noopener noreferrer' } }],
        })
        .run();
    }

    setVideoUrl('');
    setIsVideoDialogOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!(file && editor)) return;

    startTransition(() => setIsUploading(true));

    try {
      const tempUrl = URL.createObjectURL(file);

      if (file.type.startsWith('image/')) {
        editor.chain().focus().setImage({ src: tempUrl, alt: file.name }).run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: file.name,
            marks: [{ type: 'link', attrs: { href: tempUrl, target: '_blank', rel: 'noopener noreferrer' } }],
          })
          .run();
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      startTransition(() => setIsUploading(false));
      e.target.value = '';
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Toolbar */}
      <div className="bg-muted/50 flex flex-wrap items-center gap-1 border-b p-2">
        {/* Text formatting */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('bold') && 'bg-muted')}
        >
          <Bold size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('italic') && 'bg-muted')}
        >
          <Italic size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('code') && 'bg-muted')}
        >
          <Code size={16} />
        </Button>

        <div className="bg-border mx-1 h-6 w-px" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('bulletList') && 'bg-muted')}
        >
          <List size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('orderedList') && 'bg-muted')}
        >
          <ListOrdered size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('blockquote') && 'bg-muted')}
        >
          <Quote size={16} />
        </Button>

        <div className="bg-border mx-1 h-6 w-px" />

        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn('h-8 px-2 text-sm', editor.isActive('heading', { level: 2 }) && 'bg-muted')}
        >
          H2
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={cn('h-8 px-2 text-sm', editor.isActive('heading', { level: 3 }) && 'bg-muted')}
        >
          H3
        </Button>

        <div className="bg-border mx-1 h-6 w-px" />

        {/* Media */}
        <Dialog
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              />
            }
          >
            <LinkIcon size={16} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addLink')}</DialogTitle>
              <DialogDescription>{t('enterUrlToLink')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="link-url">{t('url')}</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t('urlPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLinkDialogOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={addLink}
              >
                {t('addLink')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isImageDialogOpen}
          onOpenChange={setIsImageDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              />
            }
          >
            <ImageIcon size={16} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addImage')}</DialogTitle>
              <DialogDescription>{t('enterImageUrl')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="image-url">{t('imageUrl')}</Label>
              <Input
                id="image-url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('imagePlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsImageDialogOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={addImage}
              >
                {t('addImage')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isVideoDialogOpen}
          onOpenChange={setIsVideoDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              />
            }
          >
            <SiYoutube size={16} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addVideo')}</DialogTitle>
              <DialogDescription>{t('enterVideoUrl')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="video-url">{t('videoUrl')}</Label>
              <Input
                id="video-url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={t('videoPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsVideoDialogOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={addVideo}
              >
                {t('addVideo')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File Upload */}
        <div className="hover:bg-accent relative rounded-md">
          <input
            type="file"
            id="file-upload"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={handleFileUpload}
            accept="image/*,video/*"
            disabled={isUploading || isPending}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={isUploading || isPending}
            title={t('uploadFile')}
          >
            <Upload size={16} />
          </Button>
        </div>

        <div className="bg-border mx-1 h-6 w-px" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-8 w-8 p-0"
        >
          <Undo size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-8 w-8 p-0"
        >
          <Redo size={16} />
        </Button>
      </div>

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className="prosemirror-discussion overflow-hidden"
        placeholder={placeholder}
      />
    </div>
  );
}
