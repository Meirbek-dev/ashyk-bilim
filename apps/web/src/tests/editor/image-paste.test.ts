import { describe, expect, it, vi } from 'vitest';

import {
  createAuthoringEditorExtensions,
  createPastedImageContent,
  getPastedImageFiles,
  handlePastedImages,
} from '../../components/Objects/Editor/core';

const activity = {
  activity_uuid: 'activity_123',
  name: 'Sample activity',
};

describe('image paste handler', () => {
  it('registers for the authoring preset', () => {
    const extensions = createAuthoringEditorExtensions(activity);

    expect(extensions.some((extension) => extension.name === 'imagePasteHandler')).toBe(true);
  });

  it('extracts unique image files from clipboard items and files', () => {
    const imageFile = new File(['image'], 'pasted-image.png', {
      type: 'image/png',
      lastModified: 1,
    });
    const textFile = new File(['text'], 'notes.txt', {
      type: 'text/plain',
      lastModified: 2,
    });

    const files = getPastedImageFiles({
      files: [imageFile, textFile],
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => imageFile,
        },
        {
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        },
      ],
    });

    expect(files).toEqual([imageFile]);
  });

  it('uploads pasted images and inserts image blocks', async () => {
    const imageFile = new File(['image'], 'clipboard.png', {
      type: 'image/png',
      lastModified: 10,
    });
    const insertedContent: unknown[] = [];
    const uploadImage = vi.fn().mockResolvedValue({
      block_uuid: 'block_1',
      content: {
        file_id: 'file_1',
        file_format: 'png',
      },
    });
    const editor = {
      chain: () => ({
        focus: () => ({
          insertContent: (content: unknown) => ({
            run: () => {
              insertedContent.push(content);
              return true;
            },
          }),
        }),
      }),
    };

    const handled = await handlePastedImages({
      editor: editor as never,
      files: [imageFile],
      activityUuid: activity.activity_uuid,
      uploadImage,
    });

    expect(handled).toBe(true);
    expect(uploadImage).toHaveBeenCalledWith(imageFile, activity.activity_uuid);
    expect(insertedContent).toEqual([
      createPastedImageContent([
        {
          block_uuid: 'block_1',
          content: {
            file_id: 'file_1',
            file_format: 'png',
          },
        },
      ]),
    ]);
  });
});
