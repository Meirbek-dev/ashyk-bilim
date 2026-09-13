'use client'

import { useEditorState, useTiptap } from '@tiptap/react'
import { Save, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import Modal from '@/components/Objects/Elements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { isHttpUrl, useLinkPreviewLookup } from './link-preview'

/**
 * The URL dialog for a new web-preview block. Lives in the editor chrome, not
 * in a node view: nothing is inserted (so nothing autosaves and nothing
 * re-opens on the next load) until the URL is confirmed and resolved (BUG-107).
 */
export function WebPreviewInsertDialog() {
  const { editor } = useTiptap()
  const t = useTranslations('Components.WebPreview')
  const open = useEditorState({ editor, selector: ctx => Boolean(ctx.editor?.storage.blockWebPreview.insertOpen) })
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lookup = useLinkPreviewLookup()

  function close() {
    setUrl('')
    setError(null)
    editor.commands.closeWebPreviewDialog()
  }

  function confirm() {
    if (!isHttpUrl(url)) {
      setError(t('urlMustBeHttp'))
      return
    }
    lookup.mutate(url, {
      onSuccess: attrs => {
        editor.chain().focus().insertWebPreview({ ...attrs, url }).run()
        close()
      },
    })
  }

  return (
    <Modal
      isDialogOpen={open}
      onOpenChange={isOpen => {
        if (!isOpen) close()
      }}
      dialogTitle={t('websitePreview')}
      dialogDescription={t('enterWebsiteUrl')}
      dialogContent={
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            confirm()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="web-preview-insert-url">{t('websiteUrl')}</Label>
            <Input
              id="web-preview-insert-url"
              type="text"
              autoFocus
              placeholder={t('enterWebsiteUrl')}
              value={url}
              onChange={event => {
                setUrl(event.target.value)
                setError(null)
              }}
              disabled={lookup.isPending}
            />
          </div>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              <X size={16} className="mr-1" />
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={lookup.isPending || !url}>
              <Save size={16} className="mr-1" />
              {t('save')}
            </Button>
          </div>
        </form>
      }
    />
  )
}
