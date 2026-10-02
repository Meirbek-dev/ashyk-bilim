const shapes = {
  title: 'h-9 w-1/3',
  line: 'h-4 w-2/3',
  row: 'h-row w-full',
}

/** A static placeholder of the final layout (DESIGN 7: no spinner, no pulse). */
export function Skeleton({ shape }: { shape: keyof typeof shapes }) {
  return <div aria-hidden className={`rounded-md bg-muted ${shapes[shape]}`} />
}
