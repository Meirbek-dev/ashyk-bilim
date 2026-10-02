import { m } from '#/paraglide/messages'

export function PendingView() {
  return <output className="text-muted-foreground">{m.platform_loading()}</output>
}
