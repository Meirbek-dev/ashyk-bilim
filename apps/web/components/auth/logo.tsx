import Image from 'next/image';

interface AuthLogoProps {
  width?: number;
}

const AuthLogo = ({ width = 240 }: AuthLogoProps) => (
  <Image
    src="/platform_logo_full.svg"
    alt="Ashyq Bilim"
    width={width}
    height={Math.round((width * 119.28) / 327.34)}
    priority
    className="m-4 dark:brightness-0 dark:invert"
  />
);

export default AuthLogo;
