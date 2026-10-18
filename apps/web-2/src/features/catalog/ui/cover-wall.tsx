import { CourseCover } from '#/shared/components/course-cover'

type Tile = { seed: string; imageKey: string | null | undefined }

/** Course pictures in two columns, the right one set lower, like tiles laid in a bond. Decorative: names are below. */
export function CoverWall({ tiles }: { tiles: readonly Tile[] }) {
  const columns = [tiles.filter((_, i) => i % 2 === 0), tiles.filter((_, i) => i % 2 === 1)]
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 @3xl:gap-4">
      {columns.map((column, index) => (
        <div key={index} className={`flex flex-col gap-3 @3xl:gap-4 ${index === 1 ? 'pt-10' : 'pb-10'}`}>
          {column.map(tile => (
            <CourseCover
              key={tile.seed}
              seed={tile.seed}
              imageKey={tile.imageKey}
              className="aspect-video w-full rounded-xl border shadow-xs"
            />
          ))}
        </div>
      ))}
    </div>
  )
}
