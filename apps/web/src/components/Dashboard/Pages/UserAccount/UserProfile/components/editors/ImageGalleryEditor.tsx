import type { FC } from 'react'
import { ImageIcon, Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import NextImage from '@components/ui/NextImage'
import type { ImageGallerySection, ProfileImage } from '../../types'

interface ImageGalleryEditorProps {
  t: AppTranslator
  section: ImageGallerySection
  onChange: (section: ImageGallerySection) => void
}

export const ImageGalleryEditor: FC<ImageGalleryEditorProps> = ({ t, section, onChange }) => {
  return (
    <div className="bg-card ring-foreground/10 space-y-6 rounded-lg p-6 ring-1">
      <div className="flex items-center space-x-2">
        <ImageIcon className="text-muted-foreground h-5 w-5" />
        <h3 className="text-lg font-medium">{t('ImageGalleryEditor.title')}</h3>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <Label htmlFor="title">{t('Common.sectionTitle')}</Label>
          <Input
            id="title"
            value={section.title}
            onChange={e => {
              onChange({ ...section, title: e.target.value })
            }}
            placeholder={t('Common.enterSectionTitlePlaceholder')}
          />
        </div>

        {/* Images */}
        <div>
          <Label>{t('ImageGalleryEditor.imagesLabel')}</Label>
          <div className="mt-2 space-y-3">
            {section.images.map((image, index) => (
              <div key={index} className="grid grid-cols-[2fr_1fr_auto] gap-4 rounded-lg border p-4">
                <div>
                  <Label>{t('ImageGalleryEditor.imageUrlLabel')}</Label>
                  <Input
                    value={image.url}
                    onChange={e => {
                      const newImages = [...section.images]
                      newImages[index] = { ...image, url: e.target.value }
                      onChange({ ...section, images: newImages })
                    }}
                    placeholder={t('ImageGalleryEditor.imageUrlPlaceholder')}
                  />
                </div>
                <div>
                  <Label>{t('ImageGalleryEditor.captionLabel')}</Label>
                  <Input
                    value={image.caption || ''}
                    onChange={e => {
                      const newImages = [...section.images]
                      newImages[index] = { ...image, caption: e.target.value }
                      onChange({ ...section, images: newImages })
                    }}
                    placeholder={t('ImageGalleryEditor.captionPlaceholder')}
                  />
                </div>
                <div className="flex flex-col justify-between">
                  <Label>&nbsp;</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newImages = section.images.filter((_, i) => i !== index)
                      onChange({ ...section, images: newImages })
                    }}
                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {image.url ? (
                  <div className="relative col-span-3 mt-2 h-32 w-full overflow-hidden rounded-lg">
                    <NextImage
                      src={image.url}
                      alt={image.caption || ''}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 50vw, 100vw"
                    />
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const newImage: ProfileImage = {
                  url: '',
                  caption: '',
                }
                onChange({
                  ...section,
                  images: [...section.images, newImage],
                })
              }}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('ImageGalleryEditor.addImageButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
