/** The stored `alignment` attribute ('left' | 'center' | 'right') as a flex justification. */
export const justify = (alignment: unknown): string =>
  alignment === 'center' ? 'justify-center' : alignment === 'right' ? 'justify-end' : 'justify-start'

export const stringAttr = (value: unknown): string => (typeof value === 'string' ? value : '')
