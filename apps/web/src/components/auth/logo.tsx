import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useTheme } from '@/components/providers/theme-provider'
import AppLink from '@components/ui/AppLink'

interface AuthLogoProps {
  width?: number
}

function AuthLogo({ width = 180 }: AuthLogoProps) {
  const t = useTranslations('Common')
  const { resolvedTheme } = useTheme()
  const src = resolvedTheme === 'dark' ? '/app_logo_light_full.svg' : '/app_logo_full.svg'

  return (
    // The logo is the way back to the site from the auth screens.
    <AppLink href="/" className="m-4 block w-44">
      <Image
        src={src}
        alt={t('appLogoAlt')}
        width={width}
        height={Math.round((width * 119.28) / 327.34)}
        priority
        style={{ width: '100%', height: 'auto' }}
      />
    </AppLink>
  )
}

export default AuthLogo
