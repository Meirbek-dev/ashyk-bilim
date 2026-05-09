import Image from 'next/image';
import { useTheme } from '@/components/providers/theme-provider';

interface AuthLogoProps {
  width?: number;
}

const AuthLogo = ({ width = 240 }: AuthLogoProps) => {
  const { resolvedTheme } = useTheme();
  const src = resolvedTheme === 'dark' ? '/platform_logo_light_full.svg' : '/platform_logo_full.svg';

  return (
    <div className="m-4">
      <Image
        src={src}
        alt="Ashyk Bilim"
        width={width}
        height={Math.round((width * 119.28) / 327.34)}
        priority
        style={{ width: '100%', height: 'auto' }}
      />
    </div>
  );
};

export default AuthLogo;
