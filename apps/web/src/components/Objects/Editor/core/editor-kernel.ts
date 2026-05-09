import { generateHTML } from '@tiptap/core';
import type { Content, Extension, JSONContent, Mark, Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { Youtube } from '@tiptap/extension-youtube';
import { StarterKit } from '@tiptap/starter-kit';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';

import Badges from '../Extensions/Badges/Badges';
import Buttons from '../Extensions/Buttons/Buttons';
import EmbedObjects from '../Extensions/EmbedObjects/EmbedObjects';
import Flipcard from '../Extensions/Flipcard/Flipcard';
import ImageBlock from '../Extensions/Image/ImageBlock';
import InfoCallout from '../Extensions/Callout/Info/InfoCallout';
import MathEquationBlock from '../Extensions/MathEquation/MathEquationBlock';
import PDFBlock from '../Extensions/PDF/PDFBlock';
import QuizBlock from '../Extensions/Quiz/QuizBlock';
import Scenarios from '../Extensions/Scenarios/Scenarios';
import UserBlock from '../Extensions/Users/UserBlock';
import VideoBlock from '../Extensions/Video/VideoBlock';
import WarningCallout from '../Extensions/Callout/Warning/WarningCallout';
import WebPreview from '../Extensions/WebPreview/WebPreview';
import { getLinkExtension } from '../EditorConf';

import { normalizeTiptapJsonContent } from './editor-content';
import { HeadingWithIds } from './heading-with-ids';
import { SHARED_LOWLIGHT } from './lowlight';
import { ImagePasteHandler } from './image-paste';
import { SlashCommand } from './slash-command';
import { getEditorPresetDefinition } from './editor-presets';
import type { EditorPresetDefinition, EditorPresetName } from './editor-presets';
import type { ActivityRef } from './editor-types';

export type EditorExtension = Extension | Node | Mark;

interface EditorKernelOptions {
  preset: EditorPresetName;
  activity?: ActivityRef;
}

export interface EditorKernel {
  preset: EditorPresetDefinition;
  extensions: EditorExtension[];
}

function createBaseEditorExtensions(): EditorExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      link: false,
      bulletList: {
        HTMLAttributes: {
          class: 'bullet-list',
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: 'ordered-list',
        },
      },
    }),
    HeadingWithIds.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    getLinkExtension(),
  ];
}

function createActivityBlockExtensions(activity: ActivityRef, editable: boolean): EditorExtension[] {
  return [
    InfoCallout.configure({ editable }),
    WarningCallout.configure({ editable }),
    ImageBlock.configure({ editable, activity }),
    VideoBlock.configure({ editable, activity }),
    MathEquationBlock.configure({ editable, activity }),
    PDFBlock.configure({ editable, activity }),
    QuizBlock.configure({ editable, activity }),
    Youtube.configure({ controls: true, modestBranding: true }),
    CodeBlockLowlight.configure({ lowlight: SHARED_LOWLIGHT }),
    EmbedObjects.configure({ editable, activity }),
    Badges.configure({ editable, activity }),
    Buttons.configure({ editable, activity }),
    UserBlock.configure({ editable, activity }),
    Table.configure({ resizable: editable }),
    TableRow,
    TableHeader,
    TableCell,
    WebPreview.configure({ editable, activity }),
    Flipcard.configure({ editable, activity }),
    Scenarios.configure({ editable, activity }),
  ];
}

function createDiscussionLikeExtensions({ editable }: { editable: boolean }): EditorExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      link: false,
      bulletList: {
        HTMLAttributes: {
          class: 'list-disc list-outside ml-4 space-y-1',
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: 'list-decimal list-outside ml-4 space-y-1',
        },
      },
      listItem: {
        HTMLAttributes: {
          class: 'ml-0',
        },
      },
      blockquote: {
        HTMLAttributes: {
          class: 'border-l-4 border-gray-300 pl-4 italic',
        },
      },
      code: {
        HTMLAttributes: {
          class: 'bg-gray-100 px-1 py-0.5 rounded text-sm font-mono',
        },
      },
      codeBlock: {
        HTMLAttributes: {
          class: 'bg-gray-100 p-3 rounded-md overflow-x-auto',
        },
      },
    }),
    HeadingWithIds.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }),
    getLinkExtension({
      openOnClick: !editable,
      HTMLAttributes: {
        class: 'text-blue-600 hover:text-blue-800 underline',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    Image.configure({
      HTMLAttributes: {
        class: 'max-w-full h-auto rounded-lg',
      },
    }),
    Youtube.configure({
      controls: true,
      modestBranding: true,
      HTMLAttributes: {
        class: 'w-full aspect-video rounded-lg',
      },
    }),
  ];
}

function requireActivity(activity: ActivityRef | undefined, preset: EditorPresetName): ActivityRef {
  if (!activity) {
    throw new Error(`Editor preset "${preset}" requires an activity context.`);
  }

  return activity;
}

export function createEditorExtensions(options: EditorKernelOptions): EditorExtension[] {
  switch (options.preset) {
    case 'authoring': {
      const activity = requireActivity(options.activity, options.preset);
      return [
        ...createBaseEditorExtensions(),
        SlashCommand,
        ImagePasteHandler.configure({ activity }),
        Placeholder.configure({
          placeholder: 'Начните писать или введите `/` для команд…',
        }),
        ...createActivityBlockExtensions(activity, true),
      ];
    }
    case 'interactive': {
      const activity = requireActivity(options.activity, options.preset);
      return [...createBaseEditorExtensions(), ...createActivityBlockExtensions(activity, false)];
    }
    case 'viewing': {
      return createDiscussionLikeExtensions({ editable: false });
    }
    case 'discussion': {
      return createDiscussionLikeExtensions({ editable: true });
    }
    default: {
      return createDiscussionLikeExtensions({ editable: true });
    }
  }
}

export function createEditorKernel(options: EditorKernelOptions): EditorKernel {
  return {
    preset: getEditorPresetDefinition(options.preset),
    extensions: createEditorExtensions(options),
  };
}

export function resolveEditorContent(content: unknown): Content {
  return normalizeTiptapJsonContent(content);
}

export function renderEditorHtml(
  content: unknown,
  options: Omit<EditorKernelOptions, 'preset'> & { preset: 'viewing' | 'discussion' },
): string {
  const normalized = resolveEditorContent(content);

  if (typeof normalized === 'string') {
    return normalized;
  }

  return generateHTML(normalized as JSONContent, createEditorExtensions(options));
}
