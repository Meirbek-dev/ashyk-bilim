/**
 * Compresses an image file on the client side using HTML5 Canvas.
 * Converts the image to WebP format for optimal compression.
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number; // 0.0 to 1.0
  } = {},
): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

  // Only compress image files
  if (!file.type.startsWith('image/')) {
    return file;
  }
  // Skip compression for GIFs to preserve animations
  if (file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let {width} = img;
        let {height} = img;

        // Calculate aspect ratio and target dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // fallback
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to webp
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // fallback
              return;
            }
            const webpFilename = file.name.replace(/\.[^/.]+$/, '') + '.webp';
            const compressedFile = new File([blob], webpFilename, {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/webp',
          quality,
        );
      };
      img.onerror = () => resolve(file); // fallback
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file); // fallback
    reader.readAsDataURL(file);
  });
}
