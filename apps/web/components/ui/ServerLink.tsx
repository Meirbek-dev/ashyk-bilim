import NextLink from 'next/link';
import React from 'react';

// Server-side wrapper for Next.js Link that uses default prefetch
// behavior for same-origin internal routes unless explicitly disabled.
type ServerLinkProps = React.ComponentProps<typeof NextLink> & { prefetch?: boolean };

export default function ServerLink({ prefetch, children, ...rest }: ServerLinkProps) {
  return (
    <NextLink
      prefetch={prefetch}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
