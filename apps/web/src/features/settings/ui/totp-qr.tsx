import { encode } from 'uqr'

import { m } from '#/paraglide/messages'

/** The otpauth URI as a QR code: one SVG path of dark modules, in theme ink on the page surface. */
export function TotpQr({ uri }: { uri: string }) {
  const { data, size } = encode(uri, { border: 2 })
  const path = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
  return (
    <svg
      aria-label={m.settings_totp_qr()}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-48 rounded-md bg-background fill-foreground"
    >
      <path d={path} />
    </svg>
  )
}
