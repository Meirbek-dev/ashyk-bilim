'use client';

import type { RefObject } from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmbedType = 'youtube' | 'excalidraw' | 'tldraw';

interface EmbedPanelState {
  isOpen: boolean;
  mode: 'insert' | 'edit';
  nodePos: number | null;
  initialType: EmbedType | null;
  initialUrl: string;
  triggerRef: RefObject<HTMLButtonElement> | null;
}

interface EmbedPanelActions {
  /**
   * Open the panel in insert mode.
   * @param triggerRef - Ref to the button that triggered the panel, used to
   *   return focus on close (Requirement 12.6).
   */
  open: (triggerRef: RefObject<HTMLButtonElement>) => void;

  /**
   * Open the panel in edit mode, pre-populated with the existing embed's
   * attributes (Requirements 5.5, 6.5).
   * @param nodePos - ProseMirror document position of the embedBlock node.
   * @param attrs   - Current type and URL of the embed to pre-populate.
   * @param triggerRef - Ref to the NodeView overlay button that triggered the
   *   panel, used to return focus on close.
   */
  openForEdit: (
    nodePos: number,
    attrs: { type: EmbedType; url: string },
    triggerRef: RefObject<HTMLButtonElement>,
  ) => void;

  /**
   * Close the panel and reset transient state (Requirements 3.6, 3.4).
   * Focus return to `triggerRef` is handled by the EmbedPanel component.
   */
  close: () => void;
}

// ── Initial state ─────────────────────────────────────────────────────────────

const initialState: EmbedPanelState = {
  isOpen: false,
  mode: 'insert',
  nodePos: null,
  initialType: null,
  initialUrl: '',
  triggerRef: null,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEmbedPanelStore = create<EmbedPanelState & EmbedPanelActions>()(
  devtools(
    (set) => ({
      ...initialState,

      open: (triggerRef) =>
        set(
          {
            isOpen: true,
            mode: 'insert',
            nodePos: null,
            initialType: null,
            initialUrl: '',
            triggerRef,
          },
          false,
          'EmbedPanel/open',
        ),

      openForEdit: (nodePos, attrs, triggerRef) =>
        set(
          {
            isOpen: true,
            mode: 'edit',
            nodePos,
            initialType: attrs.type,
            initialUrl: attrs.url,
            triggerRef,
          },
          false,
          'EmbedPanel/openForEdit',
        ),

      close: () =>
        set(
          {
            isOpen: false,
            // Preserve mode/nodePos/initialType/initialUrl until next open so
            // that any in-flight async work can still read them; they will be
            // overwritten on the next open() / openForEdit() call.
          },
          false,
          'EmbedPanel/close',
        ),
    }),
    { name: 'EmbedPanelStore', enabled: process.env.NODE_ENV === 'development' },
  ),
);
