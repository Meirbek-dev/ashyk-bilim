import type { ReactNode } from 'react'

import { BadgeView } from './nodes/badge-view'
import { ButtonView } from './nodes/button-view'
import { CalloutView } from './nodes/callout-view'
import { EmbedLinkView } from './nodes/embed-link-view'
import { EmbedView } from './nodes/embed-view'
import { FileView } from './nodes/file-views'
import { FlipcardView } from './nodes/flipcard-view'
import { MathView } from './nodes/math-view'
import type { ViewProps } from './nodes/parts'
import { ScenariosView } from './nodes/scenarios-view'
import { UserView } from './nodes/user-view'
import { WebPreviewView } from './nodes/web-preview-view'

export type BlockView = [(props: ViewProps) => ReactNode, ('div' | 'span')?]

/** The custom blocks of a lesson page and their React views (Tiptap-free: the editor and the static viewer share them). */
export const VIEWS: Record<string, BlockView> = {
  calloutInfo: [CalloutView],
  calloutWarning: [CalloutView],
  badge: [BadgeView],
  button: [ButtonView, 'span'],
  embedBlock: [EmbedView],
  flipcard: [FlipcardView],
  blockImage: [FileView],
  blockPDF: [FileView],
  blockVideo: [FileView],
  blockMathEquation: [MathView],
  scenarios: [ScenariosView],
  blockUser: [UserView],
  blockWebPreview: [WebPreviewView],
}

// A post's editor cannot author an embed: old posts keep the node, shown as a link (B-EDT-14).
export const DISCUSSION_VIEWS: Record<string, BlockView> = { embedBlock: [EmbedLinkView] }
