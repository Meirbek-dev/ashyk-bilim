'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

export interface TextAnnotation {
  id: string
  itemUuid: string
  start: number // inclusive char offset in item text
  end: number // exclusive char offset
  selectedText: string // the highlighted excerpt (for display)
  comment: string
}

interface AnnotationContextValue {
  annotationsByItem: Record<string, TextAnnotation[]>
  addAnnotation: (itemUuid: string, a: Omit<TextAnnotation, 'id' | 'itemUuid'>) => void
  removeAnnotation: (itemUuid: string, annotationId: string) => void
  clearAnnotations: (itemUuid: string) => void
  clearAll: () => void
}

const AnnotationContext = createContext<AnnotationContextValue | null>(null)

export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [annotationsByItem, setAnnotationsByItem] = useState<Record<string, TextAnnotation[]>>({})

  const addAnnotation = useCallback((itemUuid: string, a: Omit<TextAnnotation, 'id' | 'itemUuid'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setAnnotationsByItem(prev => ({
      ...prev,
      [itemUuid]: [...(prev[itemUuid] ?? []), { ...a, id, itemUuid }],
    }))
  }, [])

  const removeAnnotation = useCallback((itemUuid: string, annotationId: string) => {
    setAnnotationsByItem(prev => ({
      ...prev,
      [itemUuid]: (prev[itemUuid] ?? []).filter(a => a.id !== annotationId),
    }))
  }, [])

  const clearAnnotations = useCallback((itemUuid: string) => {
    setAnnotationsByItem(prev => {
      const next = { ...prev }
      delete next[itemUuid]
      return next
    })
  }, [])

  const clearAll = useCallback(() => setAnnotationsByItem({}), [])

  return (
    <AnnotationContext.Provider
      value={{
        annotationsByItem,
        addAnnotation,
        removeAnnotation,
        clearAnnotations,
        clearAll,
      }}
    >
      {children}
    </AnnotationContext.Provider>
  )
}

export function useAnnotations() {
  const ctx = useContext(AnnotationContext)
  if (!ctx) {
    throw new Error('useAnnotations must be used inside <AnnotationProvider>')
  }
  return ctx
}

/** Format the annotations for an item into a human-readable feedback block. */
export function formatAnnotationsAsFeedback(annotations: TextAnnotation[]): string {
  if (annotations.length === 0) return ''
  const lines = annotations.map((a, i) => `[${i + 1}] "${a.selectedText}" — ${a.comment}`)
  return `\n\n--- Inline notes ---\n${lines.join('\n')}`
}
