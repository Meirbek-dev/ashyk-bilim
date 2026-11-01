import { createContext } from 'react'

/**
 * The player's frame. Its tooltips and speed menu portal into it, not into `<body>`: in full screen only the frame's
 * own subtree is on screen.
 */
export const PlayerFrameContext = createContext<HTMLElement | null>(null)
