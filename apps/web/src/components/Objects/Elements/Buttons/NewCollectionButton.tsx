import { getTranslations } from 'next-intl/server'
import { Button } from '@components/ui/button'

const NewCollectionButton = async () => {
  const t = await getTranslations('Components.Button')
  return (
    <Button className="my-auto gap-2">
      <span>{t('newCollection')}</span>
      <span className="bg-primary-foreground/20 flex h-4 w-4 items-center justify-center rounded-full text-xs font-semibold">
        +
      </span>
    </Button>
  )
}

export default NewCollectionButton
