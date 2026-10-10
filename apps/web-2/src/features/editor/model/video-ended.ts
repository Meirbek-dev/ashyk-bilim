import { createContext } from 'react'

/**
 * What a hosted video in a viewed document does when it plays to the end: the lesson player marks the lesson done
 * (as the old web did); elsewhere nothing. A YouTube embed reports no end.
 */
export const VideoEndedContext = createContext<(() => void) | null>(null)
