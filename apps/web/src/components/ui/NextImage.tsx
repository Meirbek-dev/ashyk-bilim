import type { ImageProps } from 'next/image'
import Image from 'next/image'
import type { CSSProperties } from 'react'

const isBrowserOnlyImage = (src: ImageProps['src']): src is string =>
  typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:'))

const isUnconfiguredRemoteImage = (src: ImageProps['src']): src is string =>
  typeof src === 'string' && /^https?:\/\//i.test(src)

export default function NextImage({
  src,
  alt,
  unoptimized,
  fill,
  loader: _loader,
  quality: _quality,
  priority: _priority,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  overrideSrc: _overrideSrc,
  ...props
}: ImageProps) {
  if (isUnconfiguredRemoteImage(src) || isBrowserOnlyImage(src)) {
    const imageStyle: CSSProperties = {
      ...(fill
        ? {
            position: 'absolute',
            height: '100%',
            width: '100%',
            inset: 0,
          }
        : null),
      ...props.style,
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element -- Arbitrary external preview images are not known at build time.
      <img {...props} src={src} alt={alt ?? ''} style={imageStyle} />
    )
  }

  return (
    <Image
      src={src}
      alt={alt ?? ''}
      unoptimized={unoptimized ?? isBrowserOnlyImage(src)}
      fill={fill}
      {...props}
    />
  )
}
