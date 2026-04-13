import type { ImageLoaderProps, ImageProps } from 'next/image';
import Image from 'next/image';

const directLoader = ({ src }: ImageLoaderProps) => src;

export default function NextImage({ src, alt, ...props }: ImageProps) {
  return (
    <Image
      src={src}
      alt={alt ?? ''}
      loader={directLoader}
      unoptimized
      {...props}
    />
  );
}
