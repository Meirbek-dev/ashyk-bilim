import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NextImage from '../../components/ui/NextImage';

describe('NextImage', () => {
  it('renders arbitrary remote URLs as browser images', () => {
    render(
      <div className="relative h-40 w-40">
        <NextImage
          src="https://developer.android.com/static/images/social/android-developers.png"
          alt="Android preview"
          fill
        />
      </div>,
    );

    const image = screen.getByAltText('Android preview');

    expect(image.tagName).toBe('IMG');
    expect(image).toHaveAttribute('src', 'https://developer.android.com/static/images/social/android-developers.png');
  });
});
