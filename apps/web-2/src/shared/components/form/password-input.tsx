import { Eye, EyeOff } from 'lucide-react'
import { type ComponentProps, useState } from 'react'

import { m } from '#/paraglide/messages'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '#/shared/ui/input-group'

/**
 * A password box with a «show» switch (a toggle: `aria-pressed`), so a password typed on a phone can be checked
 * before it is sent. Hidden again on every new page: the state is the component's.
 */
export function PasswordInput(props: ComponentProps<typeof InputGroupInput>) {
  const [shown, setShown] = useState(false)
  const Icon = shown ? EyeOff : Eye
  return (
    <InputGroup className="h-control">
      <InputGroupInput {...props} type={shown ? 'text' : 'password'} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-label={m.ui_password_show()}
          aria-pressed={shown}
          onClick={() => setShown(value => !value)}
        >
          <Icon aria-hidden />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
