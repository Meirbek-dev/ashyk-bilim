import ScenariosExtension from './ScenariosExtension';
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';
import { nodeView } from '@components/Objects/Editor/core';

export interface ScenarioOption {
  id: string;
  text: string;
  nextScenarioId: string | null;
}

export interface Scenario {
  id: string;
  text: string;
  imageUrl?: string;
  options: ScenarioOption[];
}

export interface ScenarioAttrs {
  title: string;
  scenarios: Scenario[];
  currentScenarioId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scenarios: {
      insertScenarios: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'scenarios',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      title: {
        // Keep the node defaults neutral so translations are provided
        // from the React NodeView (ScenariosExtension) which can use
        // the i18n/translations system.
        default: '',
      },
      scenarios: {
        // No hard-coded scenario content here. The editor NodeView
        // (ScenariosExtension) will populate scenarios and render localized
        // default text via the translations system.
        default: [],
      },
      currentScenarioId: {
        // Default to the first scenario id when scenarios are provided
        // from the node view. Use '1' as a neutral placeholder.
        default: '1',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'scenarios-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['scenarios-block', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertScenarios:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(ScenariosExtension);
  },
});
