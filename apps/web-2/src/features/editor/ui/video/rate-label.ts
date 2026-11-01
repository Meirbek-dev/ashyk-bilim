import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'

/** «Обычная» for 1, else «1,5×» (the locale's decimal mark; the sign reads the same in every locale). */
export const rateLabel = (rate: number) => (rate === 1 ? m.editor_video_speed_normal() : `${formatNumber(rate)}×`)
