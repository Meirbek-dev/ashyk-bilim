import type { FC } from 'react'
import { ImageIcon } from 'lucide-react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import NextImage from '@components/ui/NextImage'
import type { ImageGallerySection } from '../../types'
import { AddItemButton, RemoveItemButton, SectionFrame, patchAt } from './SectionFrame'

interface ImageGalleryEditorProps {
  t: AppTranslator
  section: ImageGallerySection
  onChange: (section: ImageGallerySection) => void
}

export const ImageGalleryEditor: FC<ImageGalleryEditorProps> = ({ t, section, onChange }) => (
  <SectionFrame
    t={t}
    icon={ImageIcon}
    heading={t('ImageGalleryEditor.title')}
    title={section.title}
    onTitleChange={title => onChange({ ...section, title })}
  >
    <div>
      <Label>{t('ImageGalleryEditor.imagesLabel')}</Label>
      <div className="mt-2 space-y-3">
        {section.images.map((image, index) => (
          <div key={index} className="grid grid-cols-[2fr_1fr_auto] gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor={`image-url-${index}`}>{t('ImageGalleryEditor.imageUrlLabel')}</Label>
              <Input
                id={`image-url-${index}`}
                value={image.url}
                onChange={e => {
                  onChange({ ...section, images: patchAt(section.images, index, { url: e.target.value }) })
                }}
                placeholder={t('ImageGalleryEditor.imageUrlPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor={`image-caption-${index}`}>{t('ImageGalleryEditor.captionLabel')}</Label>
              <Input
                id={`image-caption-${index}`}
                value={image.caption ?? ''}
                onChange={e => {
                  onChange({ ...section, images: patchAt(section.images, index, { caption: e.target.value }) })
                }}
                placeholder={t('ImageGalleryEditor.captionPlaceholder')}
              />
            </div>
            <div className="flex flex-col justify-end">
              <RemoveItemButton
                iconOnly
                label={t('AffiliationEditor.removeButton')}
                onClick={() => onChange({ ...section, images: section.images.filter((_, i) => i !== index) })}
              />
            </div>
            {/^https?:\/\//.test(image.url) ? (
              <div className="relative col-span-3 mt-2 h-32 w-full overflow-hidden rounded-lg">
                <NextImage
                  src={image.url}
                  alt={image.caption ?? ''}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
              </div>
            ) : null}
          </div>
        ))}
        <AddItemButton
          label={t('ImageGalleryEditor.addImageButton')}
          onClick={() => onChange({ ...section, images: [...section.images, { url: '', caption: '' }] })}
        />
      </div>
    </div>
  </SectionFrame>
)
