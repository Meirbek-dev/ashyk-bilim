import NextLink from 'next/link';
import type React from 'react';

type AppLinkProps = React.ComponentProps<typeof NextLink> & { prefetch?: boolean };

export default function AppLink({ prefetch, children, ...rest }: AppLinkProps) {
  return (
    <NextLink
      prefetch={prefetch}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
