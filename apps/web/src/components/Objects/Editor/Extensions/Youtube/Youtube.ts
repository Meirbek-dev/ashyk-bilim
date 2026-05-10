import { Youtube as TiptapYoutube } from '@tiptap/extension-youtube';
import YoutubeNodeView from './YoutubeNodeView';
import { nodeView } from '@components/Objects/Editor/core';

export const Youtube = TiptapYoutube.extend({
  addNodeView() {
    return nodeView(YoutubeNodeView);
  },
});

export default Youtube;
