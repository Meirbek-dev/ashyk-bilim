import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { createContext } from 'react'

import { clipboardImage } from '#/shared/api/upload'

import { fileBlockFor } from '../model/file-blocks'

/** The activity whose blocks the editor's uploads are claimed for; null = no file blocks can be added. */
export const ActivityContext = createContext<string | null>(null)

/**
 * Files pasted or dropped onto the editor, keyed by the empty block inserted for them: the block's view takes its
 * file on mount and uploads it with progress in place. ProseMirror keeps a node object until its attributes change.
 */
export const queuedFiles = new WeakMap<PMNode, File>()

function insertFile(view: EditorView, file: File, at: number): boolean {
  const type = fileBlockFor(file.type)
  const node = type ? view.state.schema.nodes[type]?.create() : undefined
  if (!node) return false
  queuedFiles.set(node, file)
  view.dispatch(view.state.tr.replaceRangeWith(at, at, node).scrollIntoView())
  return true
}

/** Authoring: a pasted image, or an image / PDF / video dropped onto the page, becomes its block. */
export const FileDrop = Extension.create({
  name: 'fileDrop',
  addProseMirrorPlugins: () => [
    new Plugin({
      props: {
        handlePaste: (view, event) => {
          const image = clipboardImage(event.clipboardData)
          return image ? insertFile(view, image, view.state.selection.from) : false
        },
        handleDrop: (view, event, _slice, moved) => {
          const file = moved ? undefined : event.dataTransfer?.files[0]
          const target = view.posAtCoords({ left: event.clientX, top: event.clientY })
          // Onto a block (an empty file block's own drop zone): the block handles it.
          if (!target || (target.inside >= 0 && view.state.doc.nodeAt(target.inside)?.isAtom)) return false
          if (!file || !insertFile(view, file, target.pos)) return false
          event.preventDefault()
          return true
        },
      },
    }),
  ],
})
