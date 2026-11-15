import { createContext } from 'react'

/**
 * The density of the surface around (`[data-density]`, DESIGN 5) for what is drawn outside it: a sheet is portalled to
 * the body, where the attribute's custom properties do not reach, so it repeats the attribute from here.
 */
export const DensityContext = createContext<'compact' | undefined>(undefined)
