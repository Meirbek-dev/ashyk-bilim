import { Extension } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { uploadNewImageFile } from '@services/blocks/Image/images';
import type { UploadedImageBlockObject } from '@services/blocks/Image/images';

import type { ActivityRef } from './editor-types';

interface ClipboardImageItem {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

export interface ClipboardImageSource {
  files?: ArrayLike<File> | Iterable<File>;
  items?: ArrayLike<ClipboardImageItem> | Iterable<ClipboardImageItem>;
}

export type ImageUploadHandler = (file: File, activityUuid: string) => Promise<UploadedImageBlockObject>;

interface HandlePastedImagesOptions {
  editor: Pick<Editor, 'chain'>;
  files: File[];
  activityUuid: string;
  uploadImage?: ImageUploadHandler;
}

interface ImagePasteHandlerOptions {
  activity: ActivityRef;
  uploadImage: ImageUploadHandler;
}

const imagePasteHandlerKey = new PluginKey('imagePasteHandler');

function getFileIdentity(file: File): string {
  return [file.name, file.size, file.type, file.lastModified].join(':');
}

export function getPastedImageFiles(source: ClipboardImageSource | null | undefined): File[] {
  const filesFromItems = Array.from(source?.items ?? [])
    .map((item) => {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) {
        return null;
      }

      return item.getAsFile();
    })
    .filter((file): file is File => Boolean(file));

  const filesFromClipboard = Array.from(source?.files ?? []).filter((file) => file.type.startsWith('image/'));
  const seen = new Set<string>();

  return [...filesFromItems, ...filesFromClipboard].filter((file) => {
    const key = getFileIdentity(file);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function createPastedImageContent(blockObjects: UploadedImageBlockObject[]): JSONContent[] {
  return blockObjects.map((blockObject) => ({
    type: 'blockImage',
    attrs: {
      blockObject,
    },
  }));
}

export function insertPastedImageBlocks(
  editor: Pick<Editor, 'chain'>,
  blockObjects: UploadedImageBlockObject[],
): boolean {
  if (blockObjects.length === 0) {
    return false;
  }

  return editor.chain().focus().insertContent(createPastedImageContent(blockObjects)).run();
}

export async function handlePastedImages(options: HandlePastedImagesOptions): Promise<boolean> {
  const { editor, files, activityUuid, uploadImage = uploadNewImageFile } = options;
  const uploadedBlocks: UploadedImageBlockObject[] = [];

  for (const file of files) {
    try {
      uploadedBlocks.push(await uploadImage(file, activityUuid));
    } catch (error) {
      console.error('Failed to upload pasted image', { fileName: file.name, error });
    }
  }

  return insertPastedImageBlocks(editor, uploadedBlocks);
}

export const ImagePasteHandler = Extension.create<ImagePasteHandlerOptions>({
  name: 'imagePasteHandler',

  addOptions() {
    return {
      activity: { activity_uuid: '' },
      uploadImage: uploadNewImageFile,
    };
  },

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this;

    return [
      new Plugin({
        key: imagePasteHandlerKey,
        props: {
          handlePaste(_view, event) {
            const files = getPastedImageFiles(event.clipboardData);
            if (files.length === 0) {
              return false;
            }

            event.preventDefault();

            void handlePastedImages({
              editor: ext.editor,
              files,
              activityUuid: ext.options.activity.activity_uuid,
              uploadImage: ext.options.uploadImage,
            }).catch((error: unknown) => {
              console.error('Failed to paste image into editor', error);
            });

            return true;
          },
        },
      }),
    ];
  },
});
