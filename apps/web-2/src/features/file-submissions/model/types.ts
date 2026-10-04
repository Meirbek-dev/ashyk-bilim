// The file-type groups a teacher ticks and a learner reads (the old studio's presets). A task stores MIME types;
// a type outside every group (legacy data) is kept as it is and shown raw.

export const TYPE_GROUP_KEYS = [
  'pdf',
  'documents',
  'images',
  'spreadsheets',
  'presentations',
  'archives',
  'code',
] as const
export type TypeGroup = (typeof TYPE_GROUP_KEYS)[number]
export type Ticks = Partial<Record<TypeGroup, boolean>>

const TYPE_GROUPS: Record<TypeGroup, readonly string[]> = {
  pdf: ['application/pdf'],
  documents: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'application/epub+zip',
    'application/x-mobipocket-ebook',
  ],
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
  spreadsheets: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
  ],
  presentations: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation',
  ],
  archives: [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-gzip',
  ],
  code: [
    'text/plain',
    'text/markdown',
    'application/json',
    'text/x-python',
    'text/javascript',
    'text/typescript',
    'text/css',
    'text/html',
    'application/xml',
    'text/x-c++src',
    'text/x-csrc',
    'text/x-java-source',
  ],
}

const groupOf = (mime: string): TypeGroup | undefined =>
  TYPE_GROUP_KEYS.find(group => TYPE_GROUPS[group].includes(mime))

/** What a learner reads: the groups the allowed types fall in, then the types outside every group. */
export function describeTypes(mimes: readonly string[]): { groups: TypeGroup[]; other: string[] } {
  const groups = TYPE_GROUP_KEYS.filter(group => mimes.some(mime => groupOf(mime) === group))
  return { groups, other: mimes.filter(mime => !groupOf(mime)) }
}

/** The ticks of the teacher's form: a group is ticked when every one of its types is allowed. */
export const tickedGroups = (mimes: readonly string[]): Ticks =>
  Object.fromEntries(TYPE_GROUP_KEYS.map(group => [group, TYPE_GROUPS[group].every(mime => mimes.includes(mime))]))

/** The stored list after the ticks: types of ticked groups plus the legacy ones outside every group. */
export function typesOf(ticks: Ticks, current: readonly string[]): string[] {
  const ticked = TYPE_GROUP_KEYS.filter(group => ticks[group]).flatMap(group => TYPE_GROUPS[group])
  return [...ticked, ...current.filter(mime => !groupOf(mime))]
}

/** A file the browser may show here or in a tab (`inline`): an image other than SVG, or a PDF. Anything else
 * (HTML, SVG, XML...) is only downloaded, never rendered on our origin. */
export function showsInline(type: string): boolean {
  const mime = type.split(';')[0]?.trim().toLowerCase() ?? ''
  return (mime.startsWith('image/') && !mime.startsWith('image/svg')) || mime === 'application/pdf'
}
