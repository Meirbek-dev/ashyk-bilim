import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useTheme } from '@/components/providers/theme-provider'

interface AuthLogoProps {
  width?: number
}

const AuthLogo = ({ width = 240 }: AuthLogoProps) => {
  const t = useTranslations('Common')
  const { resolvedTheme } = useTheme()
  const src = resolvedTheme === 'dark' ? '/app_logo_light_full.svg' : '/app_logo_full.svg'

  return (
    <div className="m-4">
      <Image
        src={src}
        alt={t('appLogoAlt')}
        width={width}
        height={Math.round((width * 119.28) / 327.34)}
        priority
        style={{ width: '100%', height: 'auto' }}
      />
    </div>
  )
}

export default AuthLogo
