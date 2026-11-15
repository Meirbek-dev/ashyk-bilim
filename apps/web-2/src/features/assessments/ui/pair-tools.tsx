import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Label } from '#/shared/ui/label'

/**
 * The tools of one pair: «no pair» (the left side stands alone) beside the right field and «remove» at the row's end;
 * on a narrow screen «remove» sits beside the first field and «no pair» under it. Both are cells of the row's grid.
 */
export function PairTools({
  number,
  unpaired,
  editable,
  removable,
  onUnpaired,
  onRemove,
}: {
  number: number
  unpaired: boolean
  editable: boolean
  removable: boolean
  onUnpaired: (unpaired: boolean) => void
  onRemove: () => void
}) {
  return (
    <>
      <Label className="col-start-2 row-start-2 shrink-0 font-normal @xl:col-start-3 @xl:row-start-1">
        <Checkbox
          aria-label={m.assessments_pair_unpaired({ number })}
          checked={unpaired}
          disabled={!editable}
          onCheckedChange={onUnpaired}
        />
        {m.assessments_pair_none()}
      </Label>
      <div className="col-start-2 row-start-1 justify-self-end @xl:col-start-4">
        <IconButton
          label={m.assessments_pair_remove({ number })}
          icon={<X aria-hidden />}
          disabled={!editable || !removable}
          onClick={onRemove}
        />
      </div>
    </>
  )
}
