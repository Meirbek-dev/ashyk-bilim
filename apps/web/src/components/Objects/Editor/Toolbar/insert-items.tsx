import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlertCircle,
  AlertTriangle,
  BadgeHelp,
  Code,
  FileText,
  GitBranch,
  Globe,
  ImagePlus,
  MousePointerClick,
  RotateCw,
  Sigma,
  Table2,
  Tags,
  User,
  Video,
} from 'lucide-react';
import { SiYoutube } from '@icons-pack/react-simple-icons';

type ToolbarTranslator = (key: string, values?: Record<string, string | number>) => string;

export type InsertCategory = 'basic' | 'media' | 'interactive';

export interface InsertItem {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  category: InsertCategory;
  includeInToolbar: boolean;
  run: (editor: Editor) => void;
}

export const INSERT_CATEGORY_LABELS: Record<InsertCategory, string> = {
  basic: 'insertGroups.text',
  media: 'insertGroups.media',
  interactive: 'insertGroups.interactive',
};

export function createInsertItems(t: ToolbarTranslator): InsertItem[] {
  return [
    {
      id: 'table',
      label: t('table'),
      description: t('slashInsertDescription', { label: t('table') }),
      icon: <Table2 className="size-4" />,
      category: 'basic',
      includeInToolbar: false,
      run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: 'codeblock',
      label: t('codeBlock'),
      description: t('slashInsertDescription', { label: t('codeBlock') }),
      icon: <Code className="size-4" />,
      category: 'basic',
      includeInToolbar: true,
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      id: 'infocallout',
      label: t('infoCallout'),
      description: t('slashInsertDescription', { label: t('infoCallout') }),
      icon: <AlertCircle className="size-4" />,
      category: 'basic',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertInfoCallout(),
    },
    {
      id: 'warningcallout',
      label: t('warningCallout'),
      description: t('slashInsertDescription', { label: t('warningCallout') }),
      icon: <AlertTriangle className="size-4" />,
      category: 'basic',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertWarningCallout(),
    },
    {
      id: 'badge',
      label: t('badges'),
      description: t('slashInsertDescription', { label: t('badges') }),
      icon: <Tags className="size-4" />,
      category: 'basic',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertBadge(),
    },
    {
      id: 'button',
      label: t('button'),
      description: t('slashInsertDescription', { label: t('button') }),
      icon: <MousePointerClick className="size-4" />,
      category: 'basic',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertButton(),
    },
    {
      id: 'image',
      label: t('image'),
      description: t('slashInsertDescription', { label: t('image') }),
      icon: <ImagePlus className="size-4" />,
      category: 'media',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertImageBlock(),
    },
    {
      id: 'video',
      label: t('video'),
      description: t('slashEmbedDescription', { label: t('video') }),
      icon: <Video className="size-4" />,
      category: 'media',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertVideoBlock(),
    },
    {
      id: 'embed',
      label: t('youtubeVideo'),
      description: t('slashEmbedDescription', { label: t('youtubeVideo') }),
      icon: <SiYoutube className="size-4" />,
      category: 'media',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertEmbedObject(),
    },
    {
      id: 'pdf',
      label: t('pdfDocument'),
      description: t('slashInsertDescription', { label: t('pdfDocument') }),
      icon: <FileText className="size-4" />,
      category: 'media',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertPDFBlock(),
    },
    {
      id: 'webpreview',
      label: t('webPreview'),
      description: t('slashEmbedDescription', { label: t('webPreview') }),
      icon: <Globe className="size-4" />,
      category: 'media',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertWebPreview(),
    },
    {
      id: 'math',
      label: t('mathEquation'),
      description: t('slashInsertDescription', { label: t('mathEquation') }),
      icon: <Sigma className="size-4" />,
      category: 'interactive',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertMathEquation(),
    },
    {
      id: 'quiz',
      label: t('interactiveQuiz'),
      description: t('slashInsertDescription', { label: t('interactiveQuiz') }),
      icon: <BadgeHelp className="size-4" />,
      category: 'interactive',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertQuizBlock(),
    },
    {
      id: 'flipcard',
      label: t('flipcard'),
      description: t('slashInsertDescription', { label: t('flipcard') }),
      icon: <RotateCw className="size-4" />,
      category: 'interactive',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertFlipcard(),
    },
    {
      id: 'scenarios',
      label: t('interactiveScenarios'),
      description: t('slashInsertDescription', { label: t('interactiveScenarios') }),
      icon: <GitBranch className="size-4" />,
      category: 'interactive',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertScenarios(),
    },
    {
      id: 'user',
      label: t('user'),
      description: t('slashInsertDescription', { label: t('user') }),
      icon: <User className="size-4" />,
      category: 'interactive',
      includeInToolbar: true,
      run: (editor) => editor.commands.insertUserBlock(),
    },
  ];
}
