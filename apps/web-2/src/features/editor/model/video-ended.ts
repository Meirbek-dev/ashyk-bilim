import { createContext } from 'react'

/**
 * What a hosted video in a viewed document does when it plays to the end: the lesson player marks the lesson done
 * (as the old web did); elsewhere nothing. A YouTube embed reports no end.
 */
export const VideoEndedContext = createContext<(() => void) | null>(null)

/**
 * The document is shown to its author (the studio's preview of a lesson's file), not to a learner: a file that does not
 * play asks for a new upload instead of "tell your teacher" (B-EDT-19).
 */
export const AuthorViewContext = createContext(false)
